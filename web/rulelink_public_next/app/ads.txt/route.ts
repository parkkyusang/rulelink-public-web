const ADS_TXT = 'google.com, pub-9819985404574274, DIRECT, f08c47fec0942fa0\n';

export function GET() {
  return new Response(ADS_TXT, {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
    },
  });
}
