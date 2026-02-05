import { SignUp } from "@clerk/nextjs";

export default function Page() {
    return (
        <div className="flex h-screen w-full items-center justify-center bg-[#020203]">
            <SignUp appearance={{
                elements: {
                    rootBox: "w-full",
                    card: "glass border-none shadow-2xl",
                }
            }} />
        </div>
    );
}
