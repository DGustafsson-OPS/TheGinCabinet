// Shown instead of a photo until a gin or tonic has one of its own: a drawn
// bottle with "Picture coming soon" (public/images/placeholder-*.svg). The
// pictures have a transparent background, so the box's own colour shows.
// alt="": the name is right next to it, so screen readers skip the picture.
import Image from "next/image";

type Props = { kind: "gin" | "tonic"; className?: string; priority?: boolean };

export default function PhotoPlaceholder({ kind, className, priority }: Props) {
  return (
    <Image
      src={`/images/placeholder-${kind}.svg`}
      alt=""
      width={400}
      height={500}
      className={className}
      preload={priority}
    />
  );
}
