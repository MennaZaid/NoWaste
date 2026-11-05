// A panel over the bottom half of the screen that can be pulled up (decision D-65, the consumer home). Drag the handle
// up to expand it and down to bring it back, or tap the handle: it is also a button for screen readers (NFR-07a).
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Animated, Pressable, StyleSheet, View, type GestureResponderEvent } from 'react-native';
import { colors, radius, spacing } from '@/theme';

interface BottomSheetProps {
  /** Height when collapsed and when expanded, in pixels. */
  collapsedHeight: number;
  expandedHeight: number;
  expanded: boolean;
  onExpandedChange: (expanded: boolean) => void;
  /** What the handle button says, for example "Show more listings" / "Show the map". */
  expandLabel: string;
  collapseLabel: string;
  children: ReactNode;
  testID?: string;
}

const DRAG_TO_SWITCH = 40;

export function BottomSheet({
  collapsedHeight,
  expandedHeight,
  expanded,
  onExpandedChange,
  expandLabel,
  collapseLabel,
  children,
  testID,
}: BottomSheetProps) {
  const [height] = useState(() => new Animated.Value(collapsedHeight));
  const startY = useRef(0);

  useEffect(() => {
    Animated.timing(height, {
      toValue: expanded ? expandedHeight : collapsedHeight,
      duration: 200,
      useNativeDriver: false,
    }).start();
  }, [expanded, expandedHeight, collapsedHeight, height]);

  // Dragging the handle: up expands, down collapses. A tap is handled by the button inside.
  const drag = {
    onMoveShouldSetResponder: (event: GestureResponderEvent) =>
      Math.abs(event.nativeEvent.pageY - startY.current) > 8,
    onStartShouldSetResponderCapture: (event: GestureResponderEvent) => {
      startY.current = event.nativeEvent.pageY;
      return false;
    },
    onResponderRelease: (event: GestureResponderEvent) => {
      const dy = event.nativeEvent.pageY - startY.current;
      if (dy < -DRAG_TO_SWITCH && !expanded) onExpandedChange(true);
      else if (dy > DRAG_TO_SWITCH && expanded) onExpandedChange(false);
    },
  };

  return (
    <Animated.View testID={testID} style={[styles.sheet, { height }]}>
      <View {...drag}>
        <Pressable
          testID={testID === undefined ? undefined : `${testID}-handle`}
          accessibilityRole="button"
          accessibilityLabel={expanded ? collapseLabel : expandLabel}
          accessibilityState={{ expanded }}
          onPress={() => {
            onExpandedChange(!expanded);
          }}
          style={styles.handleArea}
        >
          <View style={styles.handle} />
        </Pressable>
      </View>
      <View style={styles.body}>{children}</View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  sheet: {
    position: 'absolute',
    start: 0,
    end: 0,
    bottom: 0,
    backgroundColor: colors.surface,
    borderTopStartRadius: radius.lg,
    borderTopEndRadius: radius.lg,
    borderTopWidth: 1,
    borderColor: colors.border,
    elevation: 8,
    shadowColor: '#000',
    shadowOpacity: 0.12,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: -2 },
  },
  handleArea: {
    alignItems: 'center',
    paddingVertical: spacing.md,
  },
  handle: {
    width: 44,
    height: 5,
    borderRadius: radius.pill,
    backgroundColor: colors.border,
  },
  body: {
    flex: 1,
  },
});
