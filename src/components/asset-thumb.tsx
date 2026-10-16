import { Image, type ImageStyle } from 'expo-image';
import { Asset } from 'expo-media-library';
import { useEffect, useState } from 'react';
import type { StyleProp } from 'react-native';

import { useTheme } from '@/hooks/use-theme';

/** Shows a device photo by media-library id, resolving its URI lazily. */
export function AssetThumb({ id, style }: { id: string; style?: StyleProp<ImageStyle> }) {
  const theme = useTheme();
  const [uri, setUri] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    new Asset(id)
      .getUri()
      .then((u) => !cancelled && setUri(u))
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [id]);

  return (
    <Image
      source={uri ? { uri } : undefined}
      style={[{ backgroundColor: theme.backgroundElement }, style]}
      contentFit="cover"
      recyclingKey={id}
      transition={150}
    />
  );
}
