import { Button } from "@/components/ui/button";
import { ArrowUpRight } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
export default function Home() {
   
  return (
    <div className="z-20 flex flex-col items-center justify-center w-full px-4 py-1 my-auto">
      <div className="flex flex-col justify-center items-center my-1 sm:my-2">
        <Image
          src={"/hero.svg"}
          alt="Hero-Section"
          height={220}
          width={350}
          priority
          className="w-auto h-[120px] sm:h-[150px] md:h-[170px] lg:h-[190px] max-h-[22vh] object-contain"
        />

        <h1 className="z-20 text-3xl sm:text-5xl lg:text-6xl mt-2 sm:mt-3 font-extrabold text-center bg-clip-text text-transparent bg-gradient-to-r from-rose-500 via-red-500 to-pink-500 dark:from-rose-400 dark:via-red-400 dark:to-pink-400 tracking-tight leading-[1.2] sm:leading-[1.3]">
          Vibe Code With Intelligence
        </h1>
      </div>

      <p className="mt-1 text-sm sm:text-base md:text-lg text-center text-gray-600 dark:text-gray-400 px-4 py-1 sm:py-2 max-w-2xl">
        VibeCode Editor is a powerful and intelligent code editor that enhances
        your coding experience with advanced features and seamless integration.
        It is designed to help you write, debug, and optimize your code
        efficiently.
      </p>

      <Link href={"/dashboard"} className="mt-2 sm:mt-3">
        <Button variant={"brand"} size={"lg"}>
          Get Started
          <ArrowUpRight className="w-3.5 h-3.5" />
        </Button>
      </Link>
    </div>
  );
}
