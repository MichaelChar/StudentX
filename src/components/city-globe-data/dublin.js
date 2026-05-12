const config = {
  slug: 'dublin',
  variant: 'B',
  ink: '#1a1a1a',
  bg: '#f1ede4',

  ortho: {
    endLambda: 6.76,
    endPhi: -53.3498,
    endScale: 7200,
    dur: 2400,
    ePanExp: 2.2,
    eScaleExp: 1.6,
    hiAt: 0.04,
    gratFade: 0.55,
  },

  cityZoomIn: {
    dur: 1100,
    startScale: 0.55,
    easeExp: 2.6,
    orthoStart: null,
    orthoEnd: null,
    tier1FadeStart: 0,
    tier1FadeDenom: 0.55,
    globeFadeStart: null,
    globeFadeEnd: null,
    globeFadeExp: null,
    keepGlobe: true,
    offsetX: 20,
  },

  cityOutline: { dur: 900, tier2: { s: 0, e: 0.65 }, tier3: { s: 0.4, e: 1.0 } },
  pin: { cx: 118, cy: 114 },

  tier1: (ink) => (
    <>
      <path d="M -10 104 C 14 102, 30 106, 50 104 C 70 102, 86 106, 104 104 C 122 102, 134 106, 144 108 L 144 116 C 134 114, 122 110, 104 112 C 86 114, 70 110, 50 112 C 30 114, 14 110, -10 112 Z"
        fill={ink} fillOpacity=".09" stroke={ink} strokeOpacity=".55" strokeWidth=".7" strokeLinejoin="round"/>
      <path d="M -8 60 Q 40 58 90 60 Q 120 62 144 70"
        fill="none" stroke={ink} strokeOpacity=".35" strokeWidth=".55" strokeDasharray="2 1.4"/>
      <path d="M -8 150 Q 40 152 90 150 Q 120 149 152 146"
        fill="none" stroke={ink} strokeOpacity=".35" strokeWidth=".55" strokeDasharray="2 1.4"/>
      <path d="M 14 70 L 56 68 L 58 96 L 14 98 Z"
        fill={ink} fillOpacity=".05" stroke={ink} strokeOpacity=".4" strokeWidth=".55"/>
      <rect x="104" y="126" width="12" height="10" fill={ink} fillOpacity=".06" stroke={ink} strokeOpacity=".45" strokeWidth=".5"/>
      <rect x="122" y="122" width="10" height="8" fill={ink} fillOpacity=".06" stroke={ink} strokeOpacity=".45" strokeWidth=".5"/>
      <path d="M 110 110 L 132 110 L 132 122 L 110 122 Z"
        fill={ink} fillOpacity=".06" stroke={ink} strokeOpacity=".45" strokeWidth=".5"/>
    </>
  ),

  tier2: (ink) => (
    <>
      <g stroke={ink} fill="none" strokeLinecap="round">
        <path d="M 14 100 Q 50 100 88 100 Q 120 100 144 102" strokeOpacity=".75" strokeWidth=".9"/>
        <path d="M 14 116 Q 50 116 88 116 Q 120 116 144 118" strokeOpacity=".7" strokeWidth=".85"/>
        <path d="M 14 76 Q 56 74 100 76 Q 130 78 146 80" strokeOpacity=".55" strokeWidth=".75"/>
        <path d="M 56 92 Q 90 90 122 92 Q 138 93 144 94" strokeOpacity=".6" strokeWidth=".8"/>
        <path d="M 70 122 Q 96 120 122 122 Q 138 123 146 124" strokeOpacity=".75" strokeWidth=".9"/>
        <path d="M 14 142 Q 56 144 100 142 Q 130 141 148 140" strokeOpacity=".55" strokeWidth=".75"/>
      </g>
      <g stroke={ink} fill="none" strokeLinecap="round">
        <path d="M 76 60 L 78 100 L 80 116 L 82 140" strokeOpacity=".65" strokeWidth=".8"/>
        <path d="M 92 56 L 94 92 L 96 100 L 98 108 L 100 116 L 102 140" strokeOpacity=".95" strokeWidth="1.15"/>
        <path d="M 104 60 L 106 100 L 108 116 L 110 140" strokeOpacity=".5" strokeWidth=".7"/>
        <path d="M 116 58 L 118 100 L 120 116 L 122 144" strokeOpacity=".55" strokeWidth=".75"/>
        <path d="M 132 70 L 134 110 L 136 124 L 138 144" strokeOpacity=".55" strokeWidth=".75"/>
        <path d="M 64 80 L 66 100 L 68 116 L 70 134" strokeOpacity=".5" strokeWidth=".7"/>
        <path d="M 142 92 L 144 102 L 146 118 L 144 138" strokeOpacity=".5" strokeWidth=".7"/>
      </g>
    </>
  ),

  tier3: (ink, pulseRef) => (
    <>
      <path d="M 94 90 L 95 84 L 96 90 Z" fill={ink}/>
      <rect x="92" y="94" width="2.4" height="2.4" fill={ink}/>
      <circle cx="118" cy="114" r="1.4" fill={ink}/>
      <circle cx="68" cy="114" r="1.5" fill="none" stroke={ink} strokeWidth=".75"/>
      <circle cx="68" cy="114" r="0.5" fill={ink}/>
      <circle cx="74" cy="128" r="1.4" fill="none" stroke={ink} strokeWidth=".7"/>
      <circle cx="74" cy="128" r="0.4" fill={ink}/>
      <rect x="126" y="96" width="2.6" height="2.4" fill={ink} fillOpacity=".85"/>
      <rect x="50" y="122" width="2.4" height="2.4" fill={ink}/>
      <rect x="82" y="118" width="2.2" height="2.2" fill={ink} fillOpacity=".75"/>
      <g>
        <circle ref={pulseRef} cx="118" cy="114" r="3.2" fill="none" stroke={ink} strokeWidth="1"/>
        <circle cx="118" cy="114" r="2.5" fill={ink}/>
      </g>
    </>
  ),
};
export default config;
