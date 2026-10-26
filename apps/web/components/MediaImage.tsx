// An uploaded image with correct alt text (spec §2, §10A: images must have alt
// text or be explicitly decorative; decorative images get alt="" so screen
// readers skip them).
import Image from "next/image";

type Props = {
  media: { url: string; alt: string | null; width: number; height: number };
  className?: string;
  sizes?: string;
  priority?: boolean;
};

export default function MediaImage({ media, className, sizes, priority }: Props) {
  return (
    <Image
      src={media.url}
      alt={media.alt ?? ""}
      width={media.width}
      height={media.height}
      className={className}
      sizes={sizes}
      preload={priority}
    />
  );
}
