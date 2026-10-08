import { cn } from "@/lib/utils";
import {Footer} from "@/modules/home/footer";
import { Header } from "@/modules/home/header";
import { Metadata } from "next";

export const metadata: Metadata = {
  title: {
    template: "VibeCode - Editor ",
    default: "Code Editor For VibeCoders - VibeCode",
  },
};
export default function HomeLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="relative flex min-h-screen flex-col justify-between overflow-x-hidden md:h-dvh md:max-h-dvh md:overflow-hidden">
      <Header />
      <div
        className={cn(
          "pointer-events-none absolute inset-0",
          "[background-size:40px_40px]",
          "[background-image:linear-gradient(to_right,#e4e4e7_1px,transparent_1px),linear-gradient(to_bottom,#e4e4e7_1px,transparent_1px)]",
          "dark:[background-image:linear-gradient(to_right,#262626_1px,transparent_1px),linear-gradient(to_bottom,#262626_1px,transparent_1px)]",
        )}
      />
      <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-white [mask-image:radial-gradient(ellipse_at_center,transparent_20%,black)] dark:bg-black"/>
      <div className="relative flex flex-1 flex-col justify-between min-h-0 w-full md:h-[calc(100dvh-4.25rem)]">
        <main className="z-20 relative flex flex-1 flex-col items-center justify-center w-full min-h-0 pt-0">
          {children}
        </main>
        <Footer />
      </div>
    </div>
  );
}
