import { http, createConfig, fallback } from "wagmi";
import { polygon } from "wagmi/chains";
import { injected, walletConnect, coinbaseWallet } from "wagmi/connectors";

const WC_PROJECT_ID = process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID || "";

export const wagmiConfig = createConfig({
  chains: [polygon],
  connectors: [
    injected(),
    ...(WC_PROJECT_ID
      ? [walletConnect({ projectId: WC_PROJECT_ID })]
      : []),
    coinbaseWallet({ appName: "Plebs" }),
  ],
  transports: {
    [polygon.id]: fallback([
      http("https://polygon-rpc.com"),
      http("https://rpc.ankr.com/polygon"),
      http("https://polygon.llamarpc.com"),
    ]),
  },
  ssr: true,
});
