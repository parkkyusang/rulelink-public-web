import type {ReactNode} from 'react';

import type {PublicExternalDestination} from '@/lib/public-external-destinations';

export function PublicExternalDestinationLink({
  children,
  className,
  destination,
}: {
  children?: ReactNode;
  className?: string;
  destination: PublicExternalDestination;
}) {
  const external = destination.kind === 'external_https';
  const mailto = destination.kind === 'mailto';
  return (
    <a
      aria-label={`${destination.label}${
        external ? ' (외부 사이트, 새 탭)' : mailto ? ' (이메일 보내기)' : ''
      }`}
      className={className}
      data-external-destination-role={destination.role}
      href={destination.href}
      rel={external ? 'noopener noreferrer' : undefined}
      target={external ? '_blank' : undefined}
    >
      {children ?? destination.label}
      {external ? <span> (외부 사이트, 새 탭) ↗</span> : null}
      {mailto ? <span> (이메일 보내기)</span> : null}
    </a>
  );
}
