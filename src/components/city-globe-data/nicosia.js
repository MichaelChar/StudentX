const config = {
  slug: 'nicosia',
  variant: 'B',
  ink: '#1a1a1a',
  bg: '#f1ede4',

  ortho: {
    endLambda: -33.3823,
    endPhi: -35.1856,
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
    globeFadeStart: null,
    globeFadeEnd: null,
    globeFadeExp: null,
    keepGlobe: true,
    offsetX: 0,
  },

  cityOutline: { dur: 900, tier2: { s: 0, e: 0.65 }, tier3: { s: 0.4, e: 1.0 } },
  pin: { cx: 100, cy: 144 },

  tier1: (ink) => (
    <>
      <path d="M -10 56 Q 30 50 70 56 Q 110 64 150 58 Q 180 54 210 58"
        fill="none" stroke={ink} strokeOpacity=".4" strokeWidth=".7" strokeDasharray="3 1.6"/>
      <g fill={ink} fillOpacity=".04" stroke={ink} strokeOpacity=".7" strokeWidth=".85"
        strokeLinejoin="round" strokeLinecap="round">
        <path d="M 100 64 L 104 56 L 110 56 L 112 66 L 124 64 L 132 56 L 138 60 L 134 70 L 144 76 L 154 76 L 154 84 L 142 88 L 148 96 L 156 102 L 152 110 L 142 108 L 142 120 L 148 130 L 140 134 L 132 124 L 124 132 L 124 142 L 116 142 L 112 132 L 100 138 L 92 146 L 84 142 L 88 132 L 76 128 L 66 130 L 64 122 L 76 118 L 60 110 L 52 104 L 56 96 L 68 98 L 60 86 L 56 78 L 64 74 L 74 82 L 76 72 L 86 64 L 92 68 L 90 76 Z"/>
      </g>
    </>
  ),

  tier2: (ink) => (
    <>
      <g stroke={ink} fill="none" strokeLinecap="round">
        <path d="M 96 70 L 98 90 L 100 106 L 102 124 L 104 142" strokeOpacity=".95" strokeWidth="1.1"/>
        <path d="M 88 72 L 90 92 L 92 108 L 94 126 L 96 144" strokeOpacity=".7" strokeWidth=".85"/>
        <path d="M 110 70 L 112 90 L 114 108 L 116 126" strokeOpacity=".55" strokeWidth=".75"/>
        <path d="M 122 72 L 122 102 L 122 130" strokeOpacity=".55" strokeWidth=".75"/>
        <path d="M 64 124 L 90 126 L 116 128 L 142 124" strokeOpacity=".7" strokeWidth=".85"/>
        <path d="M 70 86 Q 90 82 110 84 Q 130 86 144 92" strokeOpacity=".6" strokeWidth=".8"/>
        <path d="M 70 130 Q 90 138 110 138 Q 130 134 144 128" strokeOpacity=".6" strokeWidth=".8"/>
        <path d="M 100 64 L 100 40 L 100 18" strokeOpacity=".55" strokeWidth=".75"/>
        <path d="M 154 80 L 174 70 L 188 60" strokeOpacity=".55" strokeWidth=".75"/>
        <path d="M 152 110 L 174 116 L 188 122" strokeOpacity=".55" strokeWidth=".75"/>
        <path d="M 140 138 L 158 156 L 172 174" strokeOpacity=".55" strokeWidth=".75"/>
        <path d="M 100 142 L 100 162 L 100 184" strokeOpacity=".7" strokeWidth=".85"/>
        <path d="M 64 138 L 44 156 L 28 172" strokeOpacity=".55" strokeWidth=".75"/>
        <path d="M 52 108 L 28 110 L 12 110" strokeOpacity=".55" strokeWidth=".75"/>
        <path d="M 60 80 L 38 70 L 22 60" strokeOpacity=".55" strokeWidth=".75"/>
      </g>
      <g stroke={ink} fill="none" strokeLinecap="round" strokeOpacity=".35" strokeWidth=".5">
        <path d="M 76 88 L 138 92"/>
        <path d="M 74 96 L 142 100"/>
        <path d="M 78 118 L 138 120"/>
        <path d="M 80 134 L 134 134"/>
        <path d="M 102 80 L 104 138"/>
        <path d="M 116 80 L 116 138"/>
        <path d="M 84 78 L 86 138"/>
      </g>
    </>
  ),

  tier3: (ink, pulseRef) => (
    <>
      <rect x="108" y="86" width="3.5" height="3" fill="none" stroke={ink} strokeWidth=".8"/>
      <path d="M 109 86 L 109 82 L 110 82 L 110 86" stroke={ink} strokeWidth=".6" fill="none"/>
      <path d="M 113 86 L 113 82 L 114 82 L 114 86" stroke={ink} strokeWidth=".6" fill="none"/>
      <circle cx="94" cy="96" r="1.4" fill="none" stroke={ink} strokeWidth=".75"/>
      <circle cx="94" cy="96" r="0.4" fill={ink}/>
      <rect x="104" y="94" width="3" height="3" fill="none" stroke={ink} strokeWidth=".75"/>
      <path d="M 142 116 L 144 110 L 146 116 Z" fill={ink}/>
      <rect x="142" y="86" width="2.4" height="2.4" fill={ink} fillOpacity=".85"/>
      <rect x="42" y="100" width="2.4" height="2.4" fill={ink} fillOpacity=".75"/>
      <rect x="50" y="148" width="2.4" height="2.4" fill={ink} fillOpacity=".75"/>
      <circle cx="100" cy="144" r="1.6" fill={ink}/>
      <rect x="117" y="118" width="2.4" height="2.4" fill={ink} fillOpacity=".8"/>
      <g>
        <circle ref={pulseRef} cx="100" cy="144" r="3.2" fill="none" stroke={ink} strokeWidth="1"/>
        <circle cx="100" cy="144" r="2.5" fill={ink}/>
      </g>
    </>
  ),
};
export default config;
