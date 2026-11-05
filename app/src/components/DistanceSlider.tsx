// A distance slider (decision D-65, the consumer map search of FR-RES-01). Dragging along the track or tapping it
// changes the value in steps; `onChange` follows the finger (the map zooms) and `onChangeEnd` gives the value when the
// finger is lifted (the offers are loaded). Screen readers treat it as an adjustable control: swipe up or down to change
// it by one step (NFR-07a). In Arabic the track runs right to left, like the rest of the layout (NFR-06).
import { useState } from 'react';
import { StyleSheet, View, type GestureResponderEvent, type LayoutChangeEvent } from 'react-native';
import { AppText } from './AppText';
import { useLanguage } from '@/i18n/LanguageProvider';
import { colors, minTouchSize, radius, spacing } from '@/theme';

interface DistanceSliderProps {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  /** The value as text, for example "10 km". */
  format: (value: number) => string;
  onChange: (value: number) => void;
  onChangeEnd: (value: number) => void;
  testID?: string;
}

const THUMB = 28;

export function DistanceSlider({
  label,
  value,
  min,
  max,
  step,
  format,
  onChange,
  onChangeEnd,
  testID,
}: DistanceSliderProps) {
  const { direction } = useLanguage();
  const [width, setWidth] = useState(0);

  const clamp = (next: number) => Math.min(max, Math.max(min, min + Math.round((next - min) / step) * step));

  // x is measured from the start of the track (its children ignore touches).
  const valueAt = (x: number) => {
    if (width <= 0) return value;
    const fraction = Math.min(1, Math.max(0, x / width));
    return clamp(min + (direction === 'rtl' ? 1 - fraction : fraction) * (max - min));
  };

  const touch = {
    onStartShouldSetResponder: () => true,
    onMoveShouldSetResponder: () => true,
    // The map underneath must not take the drag.
    onResponderTerminationRequest: () => false,
    onResponderGrant: (event: GestureResponderEvent) => {
      onChange(valueAt(event.nativeEvent.locationX));
    },
    onResponderMove: (event: GestureResponderEvent) => {
      onChange(valueAt(event.nativeEvent.locationX));
    },
    onResponderRelease: (event: GestureResponderEvent) => {
      onChangeEnd(valueAt(event.nativeEvent.locationX));
    },
  };

  const fraction = max > min ? (value - min) / (max - min) : 0;
  const offset = fraction * Math.max(0, width - THUMB);

  function stepBy(steps: number) {
    const next = clamp(value + steps * step);
    if (next !== value) {
      onChange(next);
      onChangeEnd(next);
    }
  }

  return (
    <View style={styles.container}>
      <View style={styles.labels}>
        <AppText variant="label">{label}</AppText>
        <AppText variant="label" color="primary">
          {format(value)}
        </AppText>
      </View>
      <View
        testID={testID}
        accessible
        accessibilityRole="adjustable"
        accessibilityLabel={label}
        accessibilityValue={{ min, max, now: value, text: format(value) }}
        accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
        onAccessibilityAction={(event) => {
          stepBy(event.nativeEvent.actionName === 'increment' ? 1 : -1);
        }}
        onLayout={(event: LayoutChangeEvent) => {
          setWidth(event.nativeEvent.layout.width);
        }}
        style={styles.touchArea}
        {...touch}
      >
        {/* The children ignore touches, so locationX is measured from the start of the track. */}
        <View pointerEvents="none" style={styles.track}>
          <View style={[styles.fill, { width: offset + THUMB / 2 }]} />
        </View>
        <View
          pointerEvents="none"
          // start/end follow the layout direction, so in Arabic the thumb moves from the right (NFR-06).
          style={[styles.thumb, { start: offset }]}
        />
      </View>
      <View style={styles.labels}>
        <AppText variant="caption" color="textMuted">
          {format(min)}
        </AppText>
        <AppText variant="caption" color="textMuted">
          {format(max)}
        </AppText>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: spacing.xs,
  },
  labels: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  touchArea: {
    height: minTouchSize,
    justifyContent: 'center',
  },
  track: {
    height: 6,
    borderRadius: radius.pill,
    backgroundColor: colors.border,
    overflow: 'hidden',
  },
  fill: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    start: 0,
    backgroundColor: colors.primary,
  },
  thumb: {
    position: 'absolute',
    width: THUMB,
    height: THUMB,
    borderRadius: THUMB / 2,
    backgroundColor: colors.primary,
    borderWidth: 3,
    borderColor: colors.surface,
  },
});
