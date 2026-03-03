import type { ComponentProps } from 'react';

import { cn } from '@/lib/utils';

export type ImageProps = ComponentProps<'img'> & {
  base64?: string;
  uint8Array?: Uint8Array;
  mediaType?: string;
};

export const Image = ({
  base64,
  uint8Array,
  mediaType = 'image/png',
  alt,
  className,
  ...props
}: ImageProps) => {
  let src: string | undefined;

  if (base64) {
    src = `data:${mediaType};base64,${base64}`;
  } else if (uint8Array && uint8Array.length > 0) {
    const CHUNK = 0x8000;
    const chunks: string[] = [];
    for (let i = 0; i < uint8Array.length; i += CHUNK) {
      chunks.push(String.fromCharCode(...uint8Array.subarray(i, i + CHUNK)));
    }
    src = `data:${mediaType};base64,${btoa(chunks.join(''))}`;
  }

  if (!src) return null;

  return (
    <img
      alt={alt ?? ''}
      className={cn('max-w-full h-auto rounded-md', className)}
      src={src}
      {...props}
    />
  );
};
