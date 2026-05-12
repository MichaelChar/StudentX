const config = {
  slug: 'larissa',
  variant: 'A',
  ink: '#1a1a1a',
  bg: '#f1ede4',

  ortho: {
    endLambda: -22.4191,
    endPhi: -39.6390,
    endScale: 5200,
    dur: 2600,
    hiAt: 0.12,
  },

  cityReveal: {
    dur: 1600,
    tier1: { s: 0.0, e: 0.45 },
    tier2: { s: 0.2, e: 0.8 },
    tier3: { s: 0.55, e: 1.0 },
  },

  pin: { cx: 100, cy: 122 },

  tier1: (ink) => (
    <>
      <path d="M -10 70 C 18 64, 36 72, 56 68 C 76 64, 90 72, 108 70 C 128 68, 144 76, 162 74 C 180 72, 196 76, 210 78 L 210 86 C 196 84, 180 80, 162 82 C 144 84, 128 76, 108 78 C 90 80, 76 72, 56 76 C 36 80, 18 72, -10 78 Z"
        fill={ink} fillOpacity=".09" stroke={ink} strokeOpacity=".55" strokeWidth=".7" strokeLinejoin="round"/>
      <path d="M 60 84 L 92 84 L 90 96 L 60 96 Z"
        fill={ink} fillOpacity=".05" stroke={ink} strokeOpacity=".4" strokeWidth=".55"/>
      <path d="M 110 86 Q 122 82 134 86 Q 138 96 132 104 Q 120 108 110 102 Q 106 94 110 86 Z"
        fill={ink} fillOpacity=".06" stroke={ink} strokeOpacity=".45" strokeWidth=".5"/>
      <rect x="96" y="118" width="8" height="6" fill={ink} fillOpacity=".05" stroke={ink} strokeOpacity=".4" strokeWidth=".5"/>
    </>
  ),

  tier2: (ink) => (
    <>
      <g stroke={ink} fill="none" strokeLinecap="round">
        <path d="M 60 100 Q 70 80 100 78 Q 130 78 142 100 Q 142 130 110 142 Q 78 142 64 122 Q 56 110 60 100 Z"
          strokeOpacity=".6" strokeWidth=".8"/>
        <path d="M 30 100 Q 50 60 100 58 Q 156 58 172 102 Q 172 144 110 162 Q 50 164 28 130 Q 18 114 30 100 Z"
          strokeOpacity=".5" strokeWidth=".75"/>
      </g>
      <g stroke={ink} fill="none" strokeLinecap="round">
        <path d="M 100 50 L 100 78 L 100 118 L 100 162" strokeOpacity=".85" strokeWidth="1.05"/>
        <path d="M 30 122 L 60 122 L 96 122 L 142 122 L 174 122" strokeOpacity=".85" strokeWidth="1.05"/>
        <path d="M 50 70 L 80 100 L 100 122 L 130 150" strokeOpacity=".55" strokeWidth=".75"/>
        <path d="M 150 70 L 120 100 L 100 122 L 70 150" strokeOpacity=".55" strokeWidth=".75"/>
        <path d="M 100 122 L 130 90" strokeOpacity=".5" strokeWidth=".7"/>
        <path d="M 100 122 L 70 90" strokeOpacity=".5" strokeWidth=".7"/>
        <path d="M 100 122 L 86 156" strokeOpacity=".5" strokeWidth=".7"/>
        <path d="M 100 122 L 116 156" strokeOpacity=".5" strokeWidth=".7"/>
      </g>
      <g stroke={ink} fill="none" strokeLinecap="round" strokeOpacity=".55" strokeWidth=".65">
        <path d="M 78 70 L 78 84"/>
        <path d="M 100 68 L 100 82"/>
        <path d="M 124 70 L 124 84"/>
      </g>
    </>
  ),

  tier3: (ink, pulseRef) => (
    <>
      <path d="M 116 100 A 5 5 0 0 1 126 100" fill="none" stroke={ink} strokeWidth=".8"/>
      <circle cx="121" cy="100" r="0.6" fill={ink}/>
      <circle cx="122" cy="94" r="1.5" fill={ink}/>
      <circle cx="94" cy="108" r="1.4" fill="none" stroke={ink} strokeWidth=".75"/>
      <circle cx="94" cy="108" r="0.5" fill={ink}/>
      <rect x="99" y="120.5" width="2.4" height="2.4" fill={ink}/>
      <rect x="138" y="96" width="2.2" height="2.2" fill={ink} fillOpacity=".8"/>
      <rect x="60" y="118" width="2.4" height="2.4" fill={ink} fillOpacity=".75"/>
      <g>
        <circle ref={pulseRef} cx="100" cy="122" r="3.2" fill="none" stroke={ink} strokeWidth="1"/>
        <circle cx="100" cy="122" r="2.5" fill={ink}/>
      </g>
    </>
  ),
};
export default config;
