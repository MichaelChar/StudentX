import Image from 'next/image';

/*
  Photo for /boarding.

  The founder's photo arrives as a finished cut-out — transparent background,
  head breaking out of a yellow circle, plus an accent arc — so it is shown
  as-is. Clipping it into the design file's ringed circle would crop the
  beanie and the arc. Transparent, so it sits on both the white hero and the
  parchment "meet your guide" band.
*/
const PHOTO = { src: '/boarding/michael.webp', width: 821, height: 931 };

export default function Portrait({ alt, priority = false }) {
  return (
    <Image
      src={PHOTO.src}
      width={PHOTO.width}
      height={PHOTO.height}
      alt={alt}
      priority={priority}
      sizes="(min-width: 980px) 380px, 260px"
      className="h-auto w-[min(260px,70vw)] min-[980px]:w-[min(380px,100%)]"
    />
  );
}
