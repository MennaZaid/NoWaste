// The consumer home (US-26 map search, FR-RES-01, decision D-65): a map of the branches that have offers within a
// distance of the consumer, a distance slider (default and range from the settings row FR-RES-01, read through the
// API) that zooms the map, and a panel at the bottom that can be pulled up with the offers in range, in the
// FR-RTE-08 / FR-RTE-09 order from the server. Tapping a branch pin shows only that branch's offers, with the shop name,
// the branch address and a close (×) button back to all offers. Tapping an offer opens its product page.
// IF-HW-03 / IF-HW-04: the app asks for the location; if it is refused, it says that nearby search needs it and shows
// offers around central Cairo (D-65, part of TBD-3), with a button to ask again.
// D-87 (US-26 filters): a maximum price and an "I can pick up by" time, checked with the shared rules the server also
// applies; they work together, stay when the distance changes and can be cleared. The vendor rating filter waits for
// ratings (a later story). D-88: the distance and the two filters are chips over the map; each chip opens a pop-up sheet
// with its control, price and time are applied with Apply, and the list starts at about a third of the screen.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { validateOfferFilters, type OfferFilters } from '@nowaste/shared';
import { getNearbyOffers, type Offer, type SearchRadius } from '@/api/client';
import { useAuth } from '@/auth/AuthProvider';
import { useLanguage } from '@/i18n/LanguageProvider';
import { formatDateTime } from '@/listings/formatDateTime';
import { parseAmount } from '@/listings/formHelpers';
import { listingText } from '@/listings/listingText';
import { FALLBACK_CENTER, readDevicePosition } from '@/location/devicePosition';
import { colors, radius, spacing } from '@/theme';
import { AppText } from './AppText';
import { BottomSheet } from './BottomSheet';
import { Button } from './Button';
import { DateTimeField } from './DateTimeField';
import { DistanceSlider } from './DistanceSlider';
import { FilterSheet } from './FilterSheet';
import { ListingPhoto } from './ListingPhoto';
import { OffersMap, type Coordinates, type MapPlace } from './MapView';
import { Notice } from './Notice';
import { TextField } from './TextField';

type Located = 'asking' | 'found' | 'denied';
type Problem = 'unreachable' | 'unexpected';

const NO_FILTERS: OfferFilters = { maxPrice: null, pickupBy: null };

type Sheet = 'distance' | 'price' | 'pickup';

/** D-88: one chip over the map; filled when its filter is set. */
function Chip({
  testID,
  text,
  accessibilityLabel,
  active,
  onPress,
}: {
  testID: string;
  text: string;
  accessibilityLabel: string;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      onPress={onPress}
      style={({ pressed }) => [styles.chip, active && styles.chipActive, pressed && styles.chipPressed]}
    >
      <AppText variant="label" color={active ? 'onPrimary' : 'text'} numberOfLines={1}>
        {text} ▾
      </AppText>
    </Pressable>
  );
}

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
  const { direction, language } = useLanguage();
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
  // D-87: the filters in use (also read by every load, so they stay when the distance or position changes).
  const [filters, setFilters] = useState<OfferFilters>(NO_FILTERS);
  const filtersRef = useRef<OfferFilters>(NO_FILTERS);
  // D-88: the open pop-up sheet, and what is typed or chosen there before Apply.
  const [sheet, setSheet] = useState<Sheet | null>(null);
  const [priceText, setPriceText] = useState('');
  const [pickupDraft, setPickupDraft] = useState<string | null>(null);
  const [priceError, setPriceError] = useState(false);
  const [pickupError, setPickupError] = useState(false);

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
      const { maxPrice, pickupBy } = filtersRef.current;
      const result = await getNearbyOffers(token, {
        ...at,
        radiusKm,
        ...(maxPrice === null ? {} : { maxPrice }),
        ...(pickupBy === null ? {} : { pickupBy }),
      });
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

  /** D-87: uses the new filters and loads the offers again at the distance chosen so far. */
  function applyFilters(next: OfferFilters) {
    filtersRef.current = next;
    setFilters(next);
    if (center !== null) void load(center, km ?? undefined);
  }

  /** D-88: opens a chip's sheet with the value in use; nothing changes until Apply. */
  function openSheet(next: Sheet) {
    setPriceText(filters.maxPrice === null ? '' : String(filters.maxPrice));
    setPickupDraft(filters.pickupBy);
    setPriceError(false);
    setPickupError(false);
    setSheet(next);
  }

  /** The maximum price typed in the sheet; empty means no price filter. */
  function applyPrice() {
    const text = priceText.trim();
    const maxPrice = text === '' ? undefined : (parseAmount(text) ?? Number.NaN);
    const check = validateOfferFilters({ maxPrice }, new Date());
    setPriceError(!check.ok);
    if (!check.ok) return;
    setSheet(null);
    if (check.value.maxPrice !== filtersRef.current.maxPrice) {
      applyFilters({ ...filtersRef.current, maxPrice: check.value.maxPrice });
    }
  }

  /** "I can pick up by": checked on Apply, so choosing the day and then the time is never marked early. */
  function applyPickupBy() {
    const check = validateOfferFilters({ pickupBy: pickupDraft ?? undefined }, new Date());
    setPickupError(!check.ok);
    if (!check.ok) return;
    setSheet(null);
    if (check.value.pickupBy !== filtersRef.current.pickupBy) {
      applyFilters({ ...filtersRef.current, pickupBy: check.value.pickupBy });
    }
  }

  /** Clear in one sheet: removes only that filter. */
  function clearOne(which: 'price' | 'pickup') {
    setSheet(null);
    setPriceError(false);
    setPickupError(false);
    if (which === 'price') setPriceText('');
    else setPickupDraft(null);
    const next = which === 'price' ? { ...filters, maxPrice: null } : { ...filters, pickupBy: null };
    if (next.maxPrice !== filters.maxPrice || next.pickupBy !== filters.pickupBy) applyFilters(next);
  }

  function clearFilters() {
    setPriceText('');
    setPickupDraft(null);
    setPriceError(false);
    setPickupError(false);
    applyFilters(NO_FILTERS);
  }

  const activeFilters = (filters.maxPrice === null ? 0 : 1) + (filters.pickupBy === null ? 0 : 1);
  const priceValue =
    filters.maxPrice === null
      ? t('offers.filters.anyPrice')
      : t('offers.filters.upTo', { price: t('listing.egp', { amount: filters.maxPrice }) });
  const pickupValue =
    filters.pickupBy === null
      ? t('offers.filters.anyTime')
      : t('offers.filters.by', { time: formatDateTime(filters.pickupBy, language) });

  // D-88: the list starts at about a third of the screen, so the pins stay visible; it can be pulled up.
  const collapsed = Math.max(areaHeight * 0.33, 160);
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
        {/* D-88: one slim row of chips, so the map stays visible. */}
        <View style={styles.chips}>
          {radiusSettings !== null ? (
            <Chip
              testID="offers-chip-distance"
              text={formatKm(distance)}
              accessibilityLabel={t('offers.pair', { first: t('offers.distanceLabel'), second: formatKm(distance) })}
              active={false}
              onPress={() => {
                openSheet('distance');
              }}
            />
          ) : null}
          <Chip
            testID="offers-chip-price"
            text={filters.maxPrice === null ? t('offers.filters.priceChip') : priceValue}
            accessibilityLabel={t('offers.pair', { first: t('offers.filters.maxPriceLabel'), second: priceValue })}
            active={filters.maxPrice !== null}
            onPress={() => {
              openSheet('price');
            }}
          />
          <Chip
            testID="offers-chip-pickup"
            text={filters.pickupBy === null ? t('offers.filters.pickupChip') : pickupValue}
            accessibilityLabel={t('offers.pair', { first: t('offers.filters.pickupByLabel'), second: pickupValue })}
            active={filters.pickupBy !== null}
            onPress={() => {
              openSheet('pickup');
            }}
          />
        </View>
      </View>

      {radiusSettings !== null ? (
        <FilterSheet
          visible={sheet === 'distance'}
          title={t('offers.distanceLabel')}
          closeLabel={t('offers.filters.done')}
          onClose={() => {
            setSheet(null);
          }}
        >
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
          <Button
            label={t('offers.filters.done')}
            onPress={() => {
              setSheet(null);
            }}
          />
        </FilterSheet>
      ) : null}

      <FilterSheet
        visible={sheet === 'price'}
        title={t('offers.filters.maxPriceLabel')}
        closeLabel={t('offers.filters.done')}
        onClose={() => {
          setSheet(null);
        }}
      >
        <TextField
          testID="offers-max-price"
          label={t('offers.filters.maxPriceLabel')}
          value={priceText}
          onChangeText={(text) => {
            setPriceText(text);
            setPriceError(false);
          }}
          error={priceError ? t('offers.filters.priceError') : undefined}
          keyboardType="decimal-pad"
        />
        <View style={styles.sheetButtons}>
          <View style={styles.sheetButton}>
            <Button
              variant="secondary"
              label={t('offers.filters.clearOne')}
              onPress={() => {
                clearOne('price');
              }}
            />
          </View>
          <View style={styles.sheetButton}>
            <Button label={t('offers.filters.apply')} onPress={applyPrice} />
          </View>
        </View>
      </FilterSheet>

      <FilterSheet
        visible={sheet === 'pickup'}
        title={t('offers.filters.pickupByLabel')}
        closeLabel={t('offers.filters.done')}
        onClose={() => {
          setSheet(null);
        }}
      >
        <DateTimeField
          testID="offers-pickup-by"
          label={t('offers.filters.pickupByLabel')}
          hint={t('offers.filters.pickupByHint')}
          emptyText={t('offers.filters.anyTime')}
          value={pickupDraft}
          onChange={(iso) => {
            setPickupDraft(iso);
            setPickupError(false);
          }}
          error={pickupError ? t('offers.filters.pickupByError') : undefined}
        />
        <View style={styles.sheetButtons}>
          <View style={styles.sheetButton}>
            <Button
              variant="secondary"
              label={t('offers.filters.clearOne')}
              onPress={() => {
                clearOne('pickup');
              }}
            />
          </View>
          <View style={styles.sheetButton}>
            <Button label={t('offers.filters.apply')} onPress={applyPickupBy} />
          </View>
        </View>
      </FilterSheet>

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
              problem !== null ? undefined : activeFilters > 0 ? (
                // D-87: with filters, say so and offer to clear them.
                <View style={styles.emptyFiltered}>
                  <AppText testID="offers-empty" color="textMuted">
                    {t('offers.filters.empty', { km: distance })}
                  </AppText>
                  <Button variant="secondary" label={t('offers.filters.clear')} onPress={clearFilters} />
                </View>
              ) : (
                <AppText testID="offers-empty" color="textMuted">
                  {t('offers.empty', { km: distance })}
                </AppText>
              )
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
  emptyFiltered: {
    gap: spacing.sm,
  },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  chip: {
    minHeight: 40,
    justifyContent: 'center',
    paddingHorizontal: spacing.md,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  chipActive: {
    borderColor: colors.primary,
    backgroundColor: colors.primary,
  },
  chipPressed: {
    opacity: 0.8,
  },
  sheetButtons: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  sheetButton: {
    flex: 1,
  },
});
