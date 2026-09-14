import Image from "next/image";
import SignInFormClient from "@/modules/auth/components/sign-in-form-client";

export default function SignInPage() {
  return (
    <div className="flex flex-col items-center justify-center gap-6">
      <Image
        src="/login.svg"
        alt="Login"
        width={300}
        height={300}
        className="object-contain"
        priority
      />

      <SignInFormClient />
    </div>
  );
}