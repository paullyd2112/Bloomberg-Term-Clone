import { http, createConfig } from "wagmi";
import { polygon } from "wagmi/chains";
import { injected, coinbaseWallet } from "wagmi/connectors";

export const wagmiConfig = createConfig({
  chains: [polygon],
  connectors: [
    injected(),
    coinbaseWallet({ appName: "Plebs" }),
  ],
  transports: {
    [polygon.id]: http(),
  },
  ssr: true,
});
