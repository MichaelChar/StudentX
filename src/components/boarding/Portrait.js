import Image from 'next/image';

/*
  Circular photo slot for /boarding.

  `src` is a file under public/boarding/. Until the founder's photos are
  committed it renders an empty iris circle — never the design file's
  "Drop your photo here" placeholder, which was for review only.
*/
export default function Portrait({ src, alt, priority = false }) {
  return (
    <figure className="relative aspect-square w-[min(260px,70vw)] overflow-hidden rounded-full border-[10px] border-white bg-iris-soft shadow-[0_18px_50px_rgba(10,37,64,0.08),0_0_0_1px_rgba(10,37,64,0.1)] min-[980px]:w-[min(380px,100%)]">
      {src ? (
        <Image
          src={src}
          alt={alt}
          fill
          priority={priority}
          sizes="(min-width: 980px) 380px, 260px"
          className="object-cover"
        />
      ) : null}
    </figure>
  );
}
