import { SignIn } from "@clerk/nextjs";

export default function Page() {
    return (
        <div className="flex h-screen w-full items-center justify-center bg-[#020203]">
            <SignIn appearance={{
                elements: {
                    rootBox: "w-full",
                    card: "glass border-none shadow-2xl",
                }
            }} />
        </div>
    );
}
