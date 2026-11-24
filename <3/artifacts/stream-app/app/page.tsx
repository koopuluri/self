'use client';
import dynamic from 'next/dynamic';
const Stream = dynamic(() => import('./stream'), { ssr: false });
export default function Page() { return <Stream />; }
