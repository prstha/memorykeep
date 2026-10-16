import { usePermissions } from 'expo-media-library';
import { Link } from 'expo-router';
import { useEffect } from 'react';
import { ActivityIndicator, FlatList, Linking, Pressable, StyleSheet, View } from 'react-native';

import { AssetThumb } from '@/components/asset-thumb';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { scanLibrary, useLibrary } from '@/features/library-store';
import { useTheme } from '@/hooks/use-theme';

export default function TimelineScreen() {
  const theme = useTheme();
  const [permission, requestPermission] = usePermissions({ granularPermissions: ['photo'] });
  const { scanning, scannedCount, events, loose, error } = useLibrary();
  const granted = permission?.granted ?? false;

  useEffect(() => {
    if (granted && events.length === 0 && !scanning) scanLibrary();
    // Scan once when access is first granted; rescans are manual.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [granted]);

  if (!permission) {
    return <Centered><ActivityIndicator /></Centered>;
  }

  if (!granted) {
    return (
      <Centered>
        <ThemedText type="subtitle" style={styles.center}>Your memories, minus the clutter</ThemedText>
        <ThemedText themeColor="textSecondary" style={styles.center}>
          MemoryKeep groups your photos into trips and festivals, helps you pick the best ones and turns
          the rest into a collage. It needs access to your photos to do that. They stay on your phone.
        </ThemedText>
        <Button
          label={permission.canAskAgain ? 'Allow photo access' : 'Open settings to allow access'}
          onPress={permission.canAskAgain ? requestPermission : () => Linking.openSettings()}
        />
      </Centered>
    );
  }

  return (
    <ThemedView style={styles.flex}>
      <FlatList
        data={events}
        keyExtractor={(e) => e.id}
        contentContainerStyle={styles.list}
        ListHeaderComponent={
          <View style={styles.header}>
            <ThemedText themeColor="textSecondary">
              {scanning
                ? `Scanning… ${scannedCount} photos`
                : `${events.length} events · ${loose.length} loose photos`}
            </ThemedText>
            {error && <ThemedText style={{ color: '#d33' }}>{error}</ThemedText>}
            {!scanning && <Button label="Rescan" onPress={scanLibrary} subtle />}
          </View>
        }
        renderItem={({ item }) => (
          <Link href={{ pathname: '/event/[id]', params: { id: item.id } }} asChild>
            <Pressable style={[styles.card, { backgroundColor: theme.backgroundElement }]}>
              <AssetThumb id={item.coverId} style={styles.cover} />
              <View style={styles.cardText}>
                <ThemedText type="smallBold">{item.title}</ThemedText>
                <ThemedText type="small" themeColor="textSecondary">
                  {item.photoIds.length} photos
                </ThemedText>
              </View>
            </Pressable>
          </Link>
        )}
      />
    </ThemedView>
  );
}

function Centered({ children }: { children: React.ReactNode }) {
  return <ThemedView style={[styles.flex, styles.centered]}>{children}</ThemedView>;
}

function Button({ label, onPress, subtle }: { label: string; onPress: () => void; subtle?: boolean }) {
  return (
    <Pressable
      onPress={onPress}
      style={[styles.button, subtle ? styles.buttonSubtle : styles.buttonPrimary]}>
      <ThemedText type="smallBold" style={{ color: subtle ? '#208AEF' : '#fff' }}>{label}</ThemedText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  centered: { alignItems: 'center', justifyContent: 'center', padding: Spacing.four, gap: Spacing.three },
  center: { textAlign: 'center' },
  list: { padding: Spacing.three, gap: Spacing.three },
  header: { gap: Spacing.two, marginBottom: Spacing.two },
  card: { borderRadius: 16, overflow: 'hidden' },
  cover: { width: '100%', aspectRatio: 16 / 9 },
  cardText: { padding: Spacing.three, gap: Spacing.half },
  button: { paddingVertical: Spacing.three, paddingHorizontal: Spacing.four, borderRadius: 999, alignSelf: 'center' },
  buttonPrimary: { backgroundColor: '#208AEF' },
  buttonSubtle: { paddingVertical: Spacing.two, alignSelf: 'flex-start', paddingHorizontal: 0 },
});
