/** @type {import('next').NextConfig} */
const nextConfig = {
  // mongoose should run as a normal Node package on the server, not be bundled.
  serverExternalPackages: ['mongoose'],
  // Keep the dev-mode badge away from the sidebar's sign-out button.
  devIndicators: { position: 'bottom-right' },
};

export default nextConfig;
