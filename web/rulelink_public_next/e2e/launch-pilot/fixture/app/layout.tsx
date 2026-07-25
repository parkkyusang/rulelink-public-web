import type {Metadata} from 'next';
import type {ReactNode} from 'react';

export const metadata: Metadata = {
  title: '공개 법률답변 024 화면 계약 파일럿',
};

export default function Layout({children}: {children: ReactNode}) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}
