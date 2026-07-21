const basePath = "/Duxo";

export default function ImageWithBasePath({
  src,
  alt,
  className,
  priority,
  fill,
}: {
  src: string;
  alt: string;
  className?: string;
  priority?: boolean;
  fill?: boolean;
}) {
  const adjustedSrc = `${basePath}${src}`;
  const style = fill
    ? { position: "absolute" as const, height: "100%", width: "100%", inset: 0, objectFit: "cover" as const }
    : undefined;
  return (
    <img
      src={adjustedSrc}
      alt={alt}
      className={className}
      loading={priority ? "eager" : "lazy"}
      style={style}
    />
  );
}
