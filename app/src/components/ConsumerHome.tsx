// The consumer home (US-26 map search, FR-RES-01, decision D-65): a map of the branches that have offers within a
// distance of the consumer, a distance slider (default and range from the settings row FR-RES-01, read through the
// API) that zooms the map, and a panel at the bottom that can be pulled up with the offers in range, in the
// FR-RTE-08 / FR-RTE-09 order from the server. Tapping a branch pin shows only that branch's offers, with the shop name,
// the branch address and a close (×) button back to all offers. Tapping an offer opens its product page.
// IF-HW-03 / IF-HW-04: the app asks for the location; if it is refused, it says that nearby search needs it and shows
// offers around central Cairo (D-65, part of TBD-3), with a button to ask again.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { getNearbyOffers, type Offer, type SearchRadius } from '@/api/client';
import { useAuth } from '@/auth/AuthProvider';
import { useLanguage } from '@/i18n/LanguageProvider';
import { listingText } from '@/listings/listingText';
import { FALLBACK_CENTER, readDevicePosition } from '@/location/devicePosition';
import { colors, radius, spacing } from '@/theme';
import { AppText } from './AppText';
import { BottomSheet } from './BottomSheet';
import { Button } from './Button';
import { DistanceSlider } from './DistanceSlider';
import { ListingPhoto } from './ListingPhoto';
import { OffersMap, type Coordinates, type MapPlace } from './MapView';
import { Notice } from './Notice';

type Located = 'asking' | 'found' | 'denied';
type Problem = 'unreachable' | 'unexpected';

/** One row of the panel: photo, name and price (D-65). */
function OfferRow({ token, offer, onPress }: { token: string; offer: Offer; onPress: () => void }) {
  const { t } = useTranslation();
  const { language } = useLanguage();
  const name = listingText(offer, language).name ?? t('quickPost.title');
  const price = t('listing.egp', { amount: offer.price });
  return (
    <Pressable
      testID={`offer-${offer.id}`}
      accessibilityRole="button"
      accessibilityLabel={t('offers.pair', { first: name, second: price })}
      accessibilityHint={t('offers.openHint')}
      onPress={onPress}
      style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
    >
      <ListingPhoto
        testID={`offer-photo-${offer.id}`}
        token={token}
        listingId={offer.id}
        source="offer"
        style={styles.thumbnail}
      />
      <View style={styles.rowText}>
        <AppText variant="label">{name}</AppText>
        <AppText color="primary" variant="label">
          {price}
        </AppText>
      </View>
    </Pressable>
  );
}

export function ConsumerHome() {
  const { t } = useTranslation();
  const router = useRouter();
  const { direction } = useLanguage();
  const { token, signOut } = useAuth();

  const [located, setLocated] = useState<Located>('asking');
  const [center, setCenter] = useState<Coordinates | null>(null);
  const [radiusSettings, setRadiusSettings] = useState<SearchRadius | null>(null);
  // The slider value: follows the finger (zoom) before the offers are loaded for it.
  const [km, setKm] = useState<number | null>(null);
  const [offers, setOffers] = useState<Offer[]>([]);
  const [loading, setLoading] = useState(false);
  const [problem, setProblem] = useState<Problem | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [areaHeight, setAreaHeight] = useState(0);
  // Only the newest request is applied when the slider moves quickly.
  const request = useRef(0);

  const placeAt = useCallback((here: Coordinates | null) => {
    setCenter(here ?? FALLBACK_CENTER);
    setLocated(here === null ? 'denied' : 'found');
  }, []);

  useEffect(() => {
    void readDevicePosition().then(placeAt);
  }, [placeAt]);

  const locate = () => {
    setLocated('asking');
    void readDevicePosition().then(placeAt);
  };

  const load = useCallback(
    async (at: Coordinates, radiusKm?: number) => {
      if (token === null) return;
      const mine = ++request.current;
      setLoading(true);
      setProblem(null);
      const result = await getNearbyOffers(token, { ...at, radiusKm });
      if (mine !== request.current) return;
      setLoading(false);
      if (result.kind === 'ok') {
        setRadiusSettings(result.radius);
        setKm(result.radius.km);
        setOffers(result.offers);
      } else if (result.kind === 'unauthorized' || result.kind === 'suspended') {
        await signOut();
      } else {
        setProblem(result.kind === 'unreachable' ? 'unreachable' : 'unexpected');
      }
    },
    [token, signOut],
  );

  // A new position: load with the distance chosen so far, or the FR-RES-01 default the first time.
  const kmRef = useRef<number | undefined>(undefined);
  useEffect(() => {
    kmRef.current = radiusSettings?.km;
  }, [radiusSettings]);
  useEffect(() => {
    if (center !== null) void load(center, kmRef.current);
  }, [center, load]);

  // One pin per branch, in the order of its first offer.
  const places = useMemo(() => {
    const byKey = new Map<string, MapPlace & { offers: Offer[]; shopName: string; address: string }>();
    for (const offer of offers) {
      const { place } = offer;
      const existing = byKey.get(place.key);
      if (existing === undefined) {
        byKey.set(place.key, {
          key: place.key,
          latitude: place.latitude,
          longitude: place.longitude,
          title: place.shopName,
          description: place.address,
          accessibilityLabel: t('offers.pair', { first: place.shopName, second: place.address }),
          shopName: place.shopName,
          address: place.address,
          offers: [offer],
        });
      } else {
        existing.offers.push(offer);
      }
    }
    return [...byKey.values()];
  }, [offers, t]);

  const branch = selected === null ? undefined : places.find((p) => p.key === selected);
  const shown = branch?.offers ?? offers;
  const distance = km ?? radiusSettings?.defaultKm ?? 0;
  const formatKm = (value: number) => t('offers.km', { km: value });

  if (token === null) return null;
  const session = token;

  const collapsed = Math.max(areaHeight * 0.45, 160);
  const full = Math.max(areaHeight * 0.92, collapsed);

  return (
    <View
      testID="consumer-home"
      style={[styles.area, { direction }]}
      onLayout={(event) => {
        setAreaHeight(event.nativeEvent.layout.height);
      }}
    >
      {center !== null ? (
        <OffersMap
          center={center}
          radiusKm={distance}
          places={places}
          bottomInset={collapsed}
          onSelectPlace={(key) => {
            setSelected(key);
          }}
          accessibilityLabel={t('offers.mapLabel')}
        />
      ) : null}

      <View style={styles.top}>
        {located === 'denied' ? (
          <Notice testID="offers-location-needed" tone="info" message={t('offers.locationNeeded')}>
            <Button variant="secondary" label={t('offers.tryLocationAgain')} onPress={locate} />
          </Notice>
        ) : null}
        {radiusSettings !== null ? (
          <View style={styles.sliderCard}>
            <DistanceSlider
              testID="offers-distance"
              label={t('offers.distanceLabel')}
              value={distance}
              min={radiusSettings.minKm}
              max={radiusSettings.maxKm}
              step={radiusSettings.stepKm}
              format={formatKm}
              onChange={setKm}
              onChangeEnd={(value) => {
                setKm(value);
                if (center !== null) void load(center, value);
              }}
            />
          </View>
        ) : null}
      </View>

      <BottomSheet
        testID="offers-sheet"
        collapsedHeight={collapsed}
        expandedHeight={full}
        expanded={expanded}
        onExpandedChange={setExpanded}
        expandLabel={t('offers.expand')}
        collapseLabel={t('offers.collapse')}
      >
        {branch !== undefined ? (
          <View testID="offers-branch" style={styles.sheetHeader}>
            <View style={styles.sheetTitles}>
              <AppText variant="heading" accessibilityRole="header">
                {branch.shopName}
              </AppText>
              <AppText color="textMuted">{branch.address}</AppText>
            </View>
            <Pressable
              testID="offers-branch-close"
              accessibilityRole="button"
              accessibilityLabel={t('offers.closeBranch')}
              hitSlop={8}
              onPress={() => {
                setSelected(null);
              }}
              style={styles.close}
            >
              <AppText variant="heading">×</AppText>
            </Pressable>
          </View>
        ) : (
          <View style={styles.sheetHeader}>
            <AppText variant="heading" accessibilityRole="header">
              {t('offers.title', { km: distance })}
            </AppText>
          </View>
        )}
        {problem !== null ? (
          <Notice tone="error" message={t(`listing.problems.${problem}`)}>
            <Button
              variant="secondary"
              label={t('offers.retry')}
              onPress={() => {
                if (center !== null) void load(center, km ?? undefined);
              }}
            />
          </Notice>
        ) : null}
        {located === 'asking' || (loading && offers.length === 0) ? (
          <ActivityIndicator color={colors.primary} />
        ) : (
          <FlatList
            testID="offers-list"
            data={shown}
            keyExtractor={(offer) => offer.id}
            contentContainerStyle={styles.list}
            renderItem={({ item }) => (
              <OfferRow
                token={session}
                offer={item}
                onPress={() => {
                  router.push({ pathname: '/offers/[id]', params: { id: item.id } });
                }}
              />
            )}
            ListEmptyComponent={
              problem === null ? (
                <AppText testID="offers-empty" color="textMuted">
                  {t('offers.empty', { km: distance })}
                </AppText>
              ) : undefined
            }
          />
        )}
      </BottomSheet>
    </View>
  );
}

const styles = StyleSheet.create({
  area: {
    flex: 1,
    backgroundColor: colors.accent,
  },
  top: {
    padding: spacing.md,
    gap: spacing.sm,
  },
  sliderCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  sheetHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.sm,
  },
  sheetTitles: {
    flex: 1,
    gap: spacing.xs,
  },
  close: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  list: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.xl,
    gap: spacing.sm,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.sm,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  rowPressed: {
    backgroundColor: colors.accent,
  },
  thumbnail: {
    width: 72,
    height: 72,
    borderRadius: radius.md,
    backgroundColor: colors.accent,
  },
  rowText: {
    flex: 1,
    gap: spacing.xs,
  },
});
