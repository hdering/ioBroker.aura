/**
 * The Aura app icon (house-shaped "A" with a lit window), inline so it needs no
 * asset path and works behind every base URL. Same artwork as `admin/aura.svg`;
 * below 24 px the hand-tuned 16-grid version (`public/favicon.svg`) is drawn.
 */
import { useId } from 'react';

export function AuraLogo({ size = 36, className }: { size?: number; className?: string }) {
    const id = useId().replace(/:/g, '');
    if (size < 24) {
        return (
            <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 16 16"
                width={size}
                height={size}
                className={className}
                aria-hidden="true"
            >
                <defs>
                    <linearGradient id={`${id}bg`} x1="0" y1="0" x2="1" y2="1">
                        <stop offset="0" stopColor="#2f4588" />
                        <stop offset="1" stopColor="#1e1e50" />
                    </linearGradient>
                </defs>
                <rect width="16" height="16" rx="3.5" fill={`url(#${id}bg)`} />
                <path
                    d="M3 13.5 L8 3 L13 13.5"
                    fill="none"
                    stroke="#ffffff"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                />
                <rect x="6.5" y="9" width="3" height="3" rx=".5" fill="#ffc94d" />
            </svg>
        );
    }
    return (
        <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 64 64"
            width={size}
            height={size}
            className={className}
            aria-hidden="true"
        >
            <defs>
                <linearGradient id={`${id}bg`} x1="0" y1="0" x2="1" y2="1">
                    <stop offset="0" stopColor="#2c4180" />
                    <stop offset="1" stopColor="#1c1c4a" />
                </linearGradient>
                <linearGradient id={`${id}s`} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0" stopColor="#ffffff" />
                    <stop offset="1" stopColor="#a9ccff" />
                </linearGradient>
                <filter id={`${id}g`} x="-100%" y="-100%" width="300%" height="300%">
                    <feGaussianBlur stdDeviation="3.5" />
                </filter>
            </defs>
            <rect width="64" height="64" rx="15" fill={`url(#${id}bg)`} />
            <rect x=".5" y=".5" width="63" height="63" rx="14.5" fill="none" stroke="#ffffff" strokeOpacity=".12" />
            <rect x="24" y="32" width="16" height="15" rx="3" fill="#ffb938" opacity=".5" filter={`url(#${id}g)`} />
            <path
                d="M13 51 L32 13 L51 51"
                fill="none"
                stroke={`url(#${id}s)`}
                strokeWidth="6.5"
                strokeLinecap="round"
                strokeLinejoin="round"
            />
            <rect x="26" y="34" width="12" height="12" rx="2.5" fill="#ffc94d" />
        </svg>
    );
}
