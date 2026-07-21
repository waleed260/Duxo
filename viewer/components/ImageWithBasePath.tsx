import Image, { ImageProps } from "next/image";

const basePath = "/Duxo";

export default function ImageWithBasePath({ src, ...props }: ImageProps) {
  const adjustedSrc = typeof src === "string" ? `${basePath}${src}` : src;
  return <Image src={adjustedSrc} {...props} />;
}
