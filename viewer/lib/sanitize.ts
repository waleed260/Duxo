const SVG_INPUT_REGEX = /<script[\s\S]*?<\/script>|<[^>]*\bon\w+\s*=[^>]*>|javascript\s*:/gi;

export function sanitizeSvg(input: string): string {
  return input.replace(SVG_INPUT_REGEX, "");
}
