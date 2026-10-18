import { Stack, useLocalSearchParams } from 'expo-router';
import { FlatList, StyleSheet, useWindowDimensions } from 'react-native';

import { AssetThumb } from '@/components/asset-thumb';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { useLibrary } from '@/features/library-store';

const COLUMNS = 3;
const GAP = 2;

/** All photos in one event. Becomes the AI-shortlist review screen in M3/M4. */
export default function EventScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const event = useLibrary().events.find((e) => e.id === id);
  const { width } = useWindowDimensions();
  const size = (width - GAP * (COLUMNS - 1)) / COLUMNS;

  if (!event) {
    return (
      <ThemedView style={[styles.flex, styles.centered]}>
        <ThemedText>Event not found. Go back and rescan.</ThemedText>
      </ThemedView>
    );
  }

  return (
    <ThemedView style={styles.flex}>
      <Stack.Screen options={{ title: event.title }} />
      <FlatList
        data={event.photoIds}
        keyExtractor={(p) => p}
        numColumns={COLUMNS}
        columnWrapperStyle={{ gap: GAP }}
        contentContainerStyle={{ gap: GAP }}
        ListHeaderComponent={
          <ThemedText themeColor="textSecondary" style={styles.header}>
            {event.photoIds.length} photos
          </ThemedText>
        }
        renderItem={({ item }) => <AssetThumb id={item} style={{ width: size, height: size }} />}
      />
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  centered: { alignItems: 'center', justifyContent: 'center' },
  header: { padding: Spacing.three },
});
