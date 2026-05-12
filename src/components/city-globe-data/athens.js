const config = {
  slug: 'athens',
  variant: 'B',
  ink: '#1a1a1a',
  bg: '#f1ede4',

  ortho: {
    endLambda: -23.7275,
    endPhi: -37.9838,
    endScale: 4200,
    dur: 2400,
    ePanExp: 2.2,
    eScaleExp: 1.6,
    hiAt: 0.04,
    gratFade: 0.55,
  },

  cityZoomIn: {
    dur: 1400,
    startScale: 0.32,
    easeExp: 2.6,
    orthoStart: 4200,
    orthoEnd: 11000,
    tier1FadeStart: 0,
    tier1FadeDenom: 0.55,
    globeFadeStart: 0.55,
    globeFadeEnd: 1.0,
    globeFadeExp: 1.6,
    keepGlobe: false,
    offsetX: 0,
  },

  cityOutline: { dur: 900, tier2: { s: 0, e: 0.65 }, tier3: { s: 0.4, e: 1.0 } },
  pin: { cx: 124, cy: 96 },

  tier1: (ink) => (
    <>
      <path d="M 80 110 Q 88 102 100 102 Q 114 102 122 110 Q 124 122 114 130 Q 100 134 88 130 Q 78 122 80 110 Z"
        fill={ink} fillOpacity=".09" stroke={ink} strokeOpacity=".55" strokeWidth=".7"/>
      <path d="M 56 132 Q 66 126 76 132 Q 78 142 70 148 Q 60 148 54 142 Q 52 136 56 132 Z"
        fill={ink} fillOpacity=".06" stroke={ink} strokeOpacity=".45" strokeWidth=".55"/>
      <circle cx="68" cy="112" r="4" fill={ink} fillOpacity=".05" stroke={ink} strokeOpacity=".4" strokeWidth=".5"/>
      <path d="M 138 64 Q 146 58 152 62 Q 156 70 152 76 Q 144 80 138 74 Q 134 68 138 64 Z"
        fill={ink} fillOpacity=".07" stroke={ink} strokeOpacity=".5" strokeWidth=".6"/>
      <path d="M 116 96 L 138 94 L 140 110 L 118 112 Z"
        fill={ink} fillOpacity=".06" stroke={ink} strokeOpacity=".45" strokeWidth=".5"/>
      <rect x="94" y="42" width="14" height="16" fill={ink} fillOpacity=".05" stroke={ink} strokeOpacity=".4" strokeWidth=".5"/>
    </>
  ),

  tier2: (ink) => (
    <>
      <g stroke={ink} fill="none" strokeLinecap="round">
        <path d="M 70 76 L 90 84 L 110 92 L 124 96" strokeOpacity=".9" strokeWidth="1.1"/>
        <path d="M 68 82 L 88 90 L 108 96 L 124 100" strokeOpacity=".75" strokeWidth=".95"/>
        <path d="M 72 70 L 92 78 L 112 86 L 126 92" strokeOpacity=".55" strokeWidth=".75"/>
        <path d="M 124 96 L 142 90 L 162 82" strokeOpacity=".85" strokeWidth="1.05"/>
        <path d="M 124 96 L 122 116 L 118 134" strokeOpacity=".75" strokeWidth=".95"/>
        <path d="M 124 100 L 100 104 L 80 108" strokeOpacity=".8" strokeWidth="1"/>
        <path d="M 70 76 L 76 92 L 80 108" strokeOpacity=".7" strokeWidth=".9"/>
        <path d="M 70 76 L 72 60 L 74 44 L 76 28" strokeOpacity=".7" strokeWidth=".9"/>
        <path d="M 142 90 L 158 70 L 174 50" strokeOpacity=".55" strokeWidth=".75"/>
        <path d="M 70 76 L 56 96 L 40 116 L 22 134" strokeOpacity=".7" strokeWidth=".9"/>
        <path d="M 118 134 L 110 156 L 100 178" strokeOpacity=".75" strokeWidth=".95"/>
        <path d="M 78 132 Q 96 138 122 132" strokeOpacity=".5" strokeWidth=".7"/>
        <path d="M 78 132 Q 70 124 64 116" strokeOpacity=".45" strokeWidth=".65"/>
      </g>
      <g stroke={ink} fill="none" strokeLinecap="round" strokeOpacity=".4" strokeWidth=".55">
        <path d="M 92 112 L 116 110"/>
        <path d="M 94 118 L 118 116"/>
        <path d="M 96 124 L 120 122"/>
        <path d="M 100 108 L 102 128"/>
        <path d="M 110 106 L 112 128"/>
      </g>
    </>
  ),

  tier3: (ink, pulseRef) => (
    <>
      <rect x="97" y="114" width="6" height="3" fill={ink}/>
      <rect x="105" y="112" width="2.4" height="2" fill={ink} fillOpacity=".8"/>
      <rect x="126" y="118" width="3" height="2" fill={ink} fillOpacity=".75"/>
      <path d="M 138 124 A 4 5 0 0 1 138 134" fill="none" stroke={ink} strokeWidth=".8"/>
      <rect x="122.5" y="94.5" width="3" height="3" fill={ink}/>
      <circle cx="70" cy="76" r="1.6" fill="none" stroke={ink} strokeWidth=".75"/>
      <circle cx="70" cy="76" r="0.5" fill={ink}/>
      <circle cx="80" cy="108" r="1.4" fill={ink}/>
      <rect x="94" y="134" width="2.4" height="2.4" fill={ink} fillOpacity=".8"/>
      <circle cx="146" cy="68" r="0.8" fill={ink}/>
      <rect x="73" y="50" width="2.4" height="2.4" fill={ink} fillOpacity=".75"/>
      <g>
        <circle ref={pulseRef} cx="124" cy="96" r="3.2" fill="none" stroke={ink} strokeWidth="1"/>
        <circle cx="124" cy="96" r="2.5" fill={ink}/>
      </g>
    </>
  ),
};
export default config;
