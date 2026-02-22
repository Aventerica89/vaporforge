import type { ComponentProps } from 'react';

import { cn } from '@/lib/cn';

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
    const binary = uint8Array.reduce((acc, byte) => acc + String.fromCharCode(byte), '');
    src = `data:${mediaType};base64,${btoa(binary)}`;
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
