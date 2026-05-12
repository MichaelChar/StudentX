const config = {
  slug: 'london',
  variant: 'B',
  ink: '#1a1a1a',
  bg: '#f1ede4',

  ortho: {
    endLambda: 0.1278,
    endPhi: -51.5074,
    endScale: 4200,
    dur: 2400,
    ePanExp: 2.2,
    eScaleExp: 1.6,
    hiAt: 0.04,
    gratFade: 0.55,
  },

  cityZoomIn: {
    dur: 1100,
    startScale: 0.32,
    easeExp: 2.6,
    orthoStart: null,
    orthoEnd: null,
    tier1FadeStart: 0,
    tier1FadeDenom: 0.55,
    globeFadeStart: 0.45,
    globeFadeEnd: 1.0,
    globeFadeExp: 1.6,
    keepGlobe: false,
    offsetX: 0,
  },

  cityOutline: { dur: 900, tier2: { s: 0, e: 0.65 }, tier3: { s: 0.4, e: 1.0 } },
  pin: { cx: 108, cy: 60 },

  tier1: (ink, bg) => (
    <>
      <path d="M -10 118 C 18 116, 36 120, 54 124 C 72 128, 78 124, 86 118 C 96 110, 110 108, 122 116 C 134 124, 138 132, 132 142 C 126 152, 134 160, 150 156 C 168 152, 184 142, 210 138 L 210 178 C 184 178, 168 188, 150 192 C 134 196, 126 188, 132 178 C 138 168, 134 160, 122 152 C 110 144, 96 146, 86 154 C 78 160, 72 164, 54 160 C 36 156, 18 152, -10 154 Z"
        fill={bg} fillOpacity=".85" stroke={ink} strokeOpacity=".7" strokeWidth=".8" strokeLinejoin="round"/>
      <path d="M 30 70 L 64 70 L 64 92 L 30 92 Z"
        fill={ink} fillOpacity=".05" stroke={ink} strokeOpacity=".5" strokeWidth=".6"/>
      <path d="M 70 92 L 92 90 L 94 100 L 72 102 Z"
        fill={ink} fillOpacity=".05" stroke={ink} strokeOpacity=".5" strokeWidth=".6"/>
      <path d="M 60 38 Q 76 34 92 38 Q 96 50 90 60 Q 74 64 60 60 Q 56 50 60 38 Z"
        fill={ink} fillOpacity=".05" stroke={ink} strokeOpacity=".5" strokeWidth=".6"/>
    </>
  ),

  tier2: (ink) => (
    <>
      <g stroke={ink} fill="none" strokeLinecap="round">
        <path d="M 20 110 Q 50 110 80 106 Q 102 102 116 108 Q 130 116 132 130" strokeOpacity=".7" strokeWidth=".85"/>
        <path d="M 18 100 L 70 100 Q 90 100 110 96 Q 130 92 150 96 Q 170 100 184 102" strokeOpacity=".9" strokeWidth="1.15"/>
        <path d="M 18 80 L 60 80 Q 90 80 120 78 Q 150 76 184 78" strokeOpacity=".8" strokeWidth="1"/>
        <path d="M 22 60 L 60 60 Q 96 58 132 60 Q 162 62 186 64" strokeOpacity=".75" strokeWidth=".95"/>
        <path d="M 64 92 Q 90 88 116 90" strokeOpacity=".5" strokeWidth=".7"/>
        <path d="M 18 90 L 30 90 L 64 90" strokeOpacity=".5" strokeWidth=".7"/>
        <path d="M 150 100 Q 170 102 188 106" strokeOpacity=".55" strokeWidth=".75"/>
      </g>
      <g stroke={ink} fill="none" strokeLinecap="round">
        <path d="M 32 32 L 30 70 L 30 110" strokeOpacity=".5" strokeWidth=".7"/>
        <path d="M 76 30 L 78 60 L 80 100 L 82 110" strokeOpacity=".7" strokeWidth=".85"/>
        <path d="M 70 56 L 72 80 L 74 96" strokeOpacity=".55" strokeWidth=".75"/>
        <path d="M 96 60 L 98 96 L 100 108" strokeOpacity=".5" strokeWidth=".7"/>
        <path d="M 110 36 L 112 76 L 114 100 L 116 110" strokeOpacity=".55" strokeWidth=".75"/>
        <path d="M 130 40 L 132 76 L 134 100 L 136 132" strokeOpacity=".75" strokeWidth=".95"/>
        <path d="M 148 40 L 150 78 L 152 102 L 154 130" strokeOpacity=".6" strokeWidth=".8"/>
        <path d="M 88 100 L 90 116 L 92 130" strokeOpacity=".55" strokeWidth=".75"/>
        <path d="M 144 102 L 146 124 L 148 146" strokeOpacity=".5" strokeWidth=".7"/>
      </g>
      <path d="M 70 92 L 80 100" stroke={ink} strokeOpacity=".45" strokeWidth=".65" fill="none" strokeLinecap="round"/>
      <path d="M 80 100 Q 76 96 72 94" stroke={ink} strokeOpacity=".4" strokeWidth=".6" fill="none" strokeLinecap="round"/>
    </>
  ),

  tier3: (ink, pulseRef) => (
    <>
      <rect x="86" y="108" width="2.4" height="2.4" fill={ink}/>
      <circle cx="90" cy="118" r="2" fill="none" stroke={ink} strokeWidth=".7"/>
      <circle cx="90" cy="118" r="0.5" fill={ink}/>
      <circle cx="114" cy="96" r="1.6" fill="none" stroke={ink} strokeWidth=".8"/>
      <circle cx="114" cy="96" r="0.6" fill={ink}/>
      <rect x="144.5" y="104" width="3" height="3" fill={ink} fillOpacity=".85"/>
      <circle cx="82" cy="100" r="1.3" fill={ink}/>
      <path d="M 134 138 L 137 134 L 137 138 Z" fill={ink}/>
      <g>
        <circle ref={pulseRef} cx="108" cy="60" r="3.2" fill="none" stroke={ink} strokeWidth="1"/>
        <circle cx="108" cy="60" r="2.5" fill={ink}/>
      </g>
    </>
  ),
};
export default config;
