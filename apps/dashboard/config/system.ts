export const dashboardConfig={
  name:'PowerChain Staking',
  version:'1.0.0',
  authProvider:process.env.NEXT_PUBLIC_AUTH_PROVIDER??'clerk',
  socialLogin:true,
  walletVerificationRequiredForChainActions:true,
  socialLinks:[
    ['X',process.env.NEXT_PUBLIC_X_URL],
    ['Telegram',process.env.NEXT_PUBLIC_TELEGRAM_URL],
    ['Discord',process.env.NEXT_PUBLIC_DISCORD_URL],
    ['GitHub',process.env.NEXT_PUBLIC_GITHUB_URL],
  ].filter((x):x is [string,string]=>Boolean(x[1])),
} as const;
