import GridBackground from './GridBackground'
import SpotlightReveal from './SpotlightReveal'

const BG_IMAGE_1 = 'https://images.higgs.ai/?default=1&output=webp&url=https%3A%2F%2Fd8j0ntlcm91z4.cloudfront.net%2Fuser_38xzZboKViGWJOttwIXH07lWA1P%2Fhf_20260713_140344_79e1296a-86d7-43fd-9b5f-63ffe560f291.png&w=1280&q=85'
const OVERLAY_IMAGE = 'https://soft-zoom-63098134.figma.site/_assets/v11/3f10f1876e118f72a396e05a6c2d099569478272.png'

export default function HeroSection() {
  return (
    <section className="relative w-full h-screen overflow-hidden bg-black font-helvetica-neue">
      <GridBackground />

      <div
        className="absolute inset-0 z-10 bg-center bg-cover bg-no-repeat"
        style={{ backgroundImage: `url(${BG_IMAGE_1})` }}
      />

      <h1
        className="absolute top-20 sm:top-28 md:top-32 left-1/2 -translate-x-1/2 z-20 text-center text-white leading-[0.9] whitespace-nowrap m-0"
        style={{ fontFamily: "'Instrument Serif', serif" }}
      >
        <span className="text-[4.5rem] xs:text-[5.5rem] sm:text-[10rem] md:text-[13rem] lg:text-[16rem]">
          Measured
        </span>
      </h1>

      <img
        src={OVERLAY_IMAGE}
        alt=""
        className="absolute inset-0 z-25 w-full h-full object-cover pointer-events-none"
      />

      <SpotlightReveal />
    </section>
  )
}
