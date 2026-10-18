import { Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { FlatList, Pressable, StyleSheet, useWindowDimensions, View } from 'react-native';

import { AssetThumb } from '@/components/asset-thumb';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import type { PhotoVerdict } from '@/features/analysis/assess';
import { useEventAnalysis } from '@/features/analysis/use-event-analysis';
import { useLibrary } from '@/features/library-store';
import { useTheme } from '@/hooks/use-theme';

const COLUMNS = 3;
const GAP = 2;

type Filter = 'best' | 'all';

/** One event's photos, with duplicates, blurry and badly lit shots flagged and the best ones first. */
export default function EventScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const event = useLibrary().events.find((e) => e.id === id);
  const analysis = useEventAnalysis(event?.id);
  const [filter, setFilter] = useState<Filter>('best');
  const { width } = useWindowDimensions();
  const size = (width - GAP * (COLUMNS - 1)) / COLUMNS;

  if (!event) {
    return (
      <ThemedView style={[styles.flex, styles.centered]}>
        <ThemedText>Event not found. Go back and rescan.</ThemedText>
      </ThemedView>
    );
  }

  // Until the first results arrive there is no shortlist, so show everything.
  const data = filter === 'best' && analysis.shortlist.length > 0 ? analysis.shortlist : event.photoIds;
  const flagged = [...analysis.verdicts.values()].filter(isFlagged).length;

  return (
    <ThemedView style={styles.flex}>
      <Stack.Screen options={{ title: event.title }} />
      <FlatList
        data={data}
        keyExtractor={(p) => p}
        numColumns={COLUMNS}
        columnWrapperStyle={{ gap: GAP }}
        contentContainerStyle={{ gap: GAP }}
        ListHeaderComponent={
          <View style={styles.header}>
            <ThemedText themeColor="textSecondary">
              {analysis.running
                ? `Checking photos… ${analysis.done}/${analysis.total}`
                : `${event.photoIds.length} photos · ${flagged} duplicates, blurry or badly lit`}
            </ThemedText>
            {analysis.error && (
              <ThemedText type="small" style={styles.error}>
                {analysis.error}
              </ThemedText>
            )}
            <View style={styles.filters}>
              <FilterChip
                label={`Best shots (${analysis.shortlist.length})`}
                active={filter === 'best'}
                onPress={() => setFilter('best')}
              />
              <FilterChip
                label={`All (${event.photoIds.length})`}
                active={filter === 'all'}
                onPress={() => setFilter('all')}
              />
            </View>
          </View>
        }
        renderItem={({ item }) => (
          <View>
            <AssetThumb id={item} style={{ width: size, height: size }} />
            <Badges verdict={analysis.verdicts.get(item)} />
          </View>
        )}
      />
    </ThemedView>
  );
}

function isFlagged(v: PhotoVerdict): boolean {
  return !v.bestInGroup || v.blurry || v.tooDark || v.tooBright;
}

function Badges({ verdict }: { verdict?: PhotoVerdict }) {
  if (!verdict || !isFlagged(verdict)) return null;
  const labels = [
    !verdict.bestInGroup && 'Duplicate',
    verdict.blurry && 'Blurry',
    verdict.tooDark && 'Dark',
    verdict.tooBright && 'Overexposed',
  ].filter((l): l is string => Boolean(l));
  return (
    <View style={styles.badges}>
      {labels.map((l) => (
        <ThemedText key={l} type="small" style={styles.badge}>
          {l}
        </ThemedText>
      ))}
    </View>
  );
}

function FilterChip({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  const theme = useTheme();
  return (
    <Pressable
      onPress={onPress}
      style={[styles.chip, { backgroundColor: active ? theme.backgroundSelected : theme.backgroundElement }]}>
      <ThemedText type="smallBold">{label}</ThemedText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  centered: { alignItems: 'center', justifyContent: 'center' },
  header: { padding: Spacing.three, gap: Spacing.two },
  error: { color: '#d33' },
  filters: { flexDirection: 'row', gap: Spacing.two },
  chip: { paddingVertical: Spacing.one, paddingHorizontal: Spacing.three, borderRadius: 999 },
  badges: { position: 'absolute', left: 4, bottom: 4, flexDirection: 'row', flexWrap: 'wrap', gap: 2 },
  badge: {
    color: '#fff',
    backgroundColor: 'rgba(0,0,0,0.6)',
    paddingHorizontal: 6,
    borderRadius: 4,
    fontSize: 11,
    lineHeight: 16,
    overflow: 'hidden',
  },
});
