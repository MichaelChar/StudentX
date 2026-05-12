const config = {
  slug: 'heraklion',
  variant: 'B',
  ink: '#1a1a1a',
  bg: '#f1ede4',

  ortho: {
    endLambda: -25.1442,
    endPhi: -35.3387,
    endScale: 3600,
    dur: 2400,
    ePanExp: 2.2,
    eScaleExp: 1.6,
    hiAt: 0.04,
    gratFade: 0.55,
  },

  cityZoomIn: {
    dur: 1500,
    startScale: 0.32,
    easeExp: 2.6,
    orthoStart: 3600,
    orthoEnd: 14000,
    tier1FadeStart: 0.18,
    tier1FadeDenom: 0.55,
    globeFadeStart: 0.55,
    globeFadeEnd: 1.0,
    globeFadeExp: 1.6,
    keepGlobe: false,
    offsetX: 0,
  },

  cityOutline: { dur: 900, tier2: { s: 0, e: 0.65 }, tier3: { s: 0.4, e: 1.0 } },
  pin: { cx: 100, cy: 110 },

  tier1: (ink) => (
    <>
      <path d="M -10 -10 L 210 -10 L 210 50 Q 170 56 130 54 Q 100 52 70 56 Q 40 60 -10 56 Z"
        fill={ink} fillOpacity=".07" stroke="none"/>
      <path d="M -10 56 Q 40 60 70 56 Q 100 52 130 54 Q 170 56 210 50"
        fill="none" stroke={ink} strokeWidth="1"/>
      <path d="M 80 56 L 80 70 L 116 70 L 116 56"
        fill={ink} fillOpacity=".06" stroke={ink} strokeOpacity=".55" strokeWidth=".7" strokeLinejoin="round"/>
      <path d="M 116 56 L 130 50 L 138 44 L 138 38"
        fill="none" stroke={ink} strokeOpacity=".7" strokeWidth=".9" strokeLinecap="round"/>
      <path d="M 38 58 L 38 80 Q 36 100 46 122 Q 60 146 90 154 Q 124 156 150 144 Q 170 124 168 100 Q 168 78 162 58"
        fill="none" stroke={ink} strokeOpacity=".7" strokeWidth=".9" strokeLinejoin="round" strokeLinecap="round"/>
      <g fill="none" stroke={ink} strokeOpacity=".65" strokeWidth=".7" strokeLinejoin="round">
        <path d="M 38 96 L 28 100 L 38 108"/>
        <path d="M 60 144 L 56 156 L 70 154"/>
        <path d="M 100 156 L 102 168 L 112 156"/>
        <path d="M 140 142 L 152 152 L 154 140"/>
        <path d="M 168 96 L 178 96 L 168 86"/>
      </g>
    </>
  ),

  tier2: (ink) => (
    <>
      <g stroke={ink} fill="none" strokeLinecap="round">
        <path d="M 96 60 L 98 78 L 100 96 L 102 110" strokeOpacity=".95" strokeWidth="1.15"/>
        <path d="M 60 110 L 102 110 L 140 112" strokeOpacity=".85" strokeWidth="1.05"/>
        <path d="M 38 100 L 70 100 L 100 96" strokeOpacity=".7" strokeWidth=".9"/>
        <path d="M 102 110 L 124 124 L 152 142" strokeOpacity=".6" strokeWidth=".8"/>
        <path d="M 102 110 L 104 130 L 106 156" strokeOpacity=".7" strokeWidth=".85"/>
        <path d="M 100 96 L 124 100" strokeOpacity=".55" strokeWidth=".7"/>
        <path d="M 102 110 L 88 132 L 70 152" strokeOpacity=".55" strokeWidth=".7"/>
        <path d="M 50 96 Q 60 130 90 148 Q 130 152 156 132 Q 168 110 162 78" strokeOpacity=".4" strokeWidth=".6"/>
      </g>
      <g stroke={ink} fill="none" strokeLinecap="round" strokeOpacity=".4" strokeWidth=".55">
        <path d="M 80 84 L 116 86"/>
        <path d="M 78 92 L 118 94"/>
        <path d="M 76 102 L 120 104"/>
        <path d="M 86 70 L 86 110"/>
        <path d="M 110 70 L 112 110"/>
        <path d="M 122 78 L 124 110"/>
      </g>
    </>
  ),

  tier3: (ink, pulseRef) => (
    <>
      <rect x="135" y="35" width="5" height="5" fill="none" stroke={ink} strokeWidth=".9"/>
      <rect x="136.5" y="36.5" width="2" height="2" fill={ink}/>
      <circle cx="100" cy="96" r="1.6" fill="none" stroke={ink} strokeWidth=".75"/>
      <circle cx="100" cy="96" r="0.5" fill={ink}/>
      <rect x="99" y="90" width="2" height="2" fill={ink}/>
      <circle cx="94" cy="86" r="1.4" fill="none" stroke={ink} strokeWidth=".7"/>
      <circle cx="94" cy="86" r="0.4" fill={ink}/>
      <circle cx="82" cy="104" r="1.6" fill="none" stroke={ink} strokeWidth=".8"/>
      <circle cx="82" cy="104" r="0.5" fill={ink}/>
      <rect x="125" y="104" width="2.4" height="2.4" fill={ink} fillOpacity=".8"/>
      <path d="M 105 162 L 109 162 L 109 158" fill="none" stroke={ink} strokeWidth=".7"/>
      <g>
        <circle ref={pulseRef} cx="100" cy="110" r="3.2" fill="none" stroke={ink} strokeWidth="1"/>
        <circle cx="100" cy="110" r="2.5" fill={ink}/>
      </g>
    </>
  ),
};
export default config;
