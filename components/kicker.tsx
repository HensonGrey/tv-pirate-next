/** Small uppercase gold label that anchors each section — gold + caps so it
 * reads as a label, not as content. */
export default function Kicker({ children }: { children: React.ReactNode }) {
    return <p className="text-xs font-bold tracking-wider text-gold uppercase">{children}</p>;
}
