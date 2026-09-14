import React from "react";

interface AuthLayoutProps {
  children: React.ReactNode;
}

const AuthLayout = ({ children }: AuthLayoutProps) => {
  return (
    <main className="min-h-screen flex items-center justify-center bg-zinc-900">
      {children}
    </main>
  );
};

export default AuthLayout;