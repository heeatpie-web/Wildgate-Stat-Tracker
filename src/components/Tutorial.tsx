import React, { useState, useEffect } from 'react';
import { X, ChevronRight, ChevronLeft, Zap, List, Rocket, Activity, CheckCircle, GripVertical, Camera } from 'lucide-react';

interface TutorialProps {
  onComplete: () => void;
  onSkip: () => void;
}

const Tutorial: React.FC<TutorialProps> = ({ onComplete, onSkip }) => {
  const [step, setStep] = useState(0);

  const steps = [
    {
      title: "Welcome to Wildgate Tracker",
      desc: "Your ultimate command center for tracking performance in the Reach. This quick tour will get you mission-ready.",
      icon: <Rocket size={48} className="text-md-sys-primary" />,
      visual: (
          <div className="w-32 h-20 bg-md-sys-primary/20 rounded-xl border-2 border-md-sys-primary flex items-center justify-center">
              <Rocket size={32} className="text-md-sys-primary animate-pulse"/>
          </div>
      )
    },
    {
      title: "Smart vs Manual Mode",
      desc: "Use 'Smart Mode' for rapid result logging. 'Manual Mode' unlocks detailed entry for Hazards, Kills, and Objectives.",
      icon: <Zap size={48} className="text-yellow-500" />,
      visual: (
          <div className="flex bg-md-sys-surface2 p-1 rounded-xl shadow-inner scale-125">
              <div className="px-4 py-2 bg-md-sys-primary rounded-lg text-md-sys-onPrimary text-[10px] font-black uppercase">Smart</div>
              <div className="px-4 py-2 rounded-lg text-md-sys-on-surface text-[10px] font-black uppercase opacity-60">Manual</div>
          </div>
      )
    },
    {
      title: "Pilot Registry",
      desc: "Build your database of Pilots. Add them once, then assign them as Squad or Hostile for each match with a single click.",
      icon: <List size={48} className="text-blue-500" />,
      visual: (
          <div className="flex flex-col gap-2 w-48 bg-md-sys-surface2 p-3 rounded-2xl shadow-sm">
              <div className="flex justify-between items-center p-2 bg-md-sys-surface3 rounded-xl border border-md-sys-outline/10">
                  <span className="text-[10px] font-bold text-md-sys-on-surface">Ace Pilot</span>
                  <div className="flex gap-1">
                      <div className="w-8 h-6 bg-blue-500 rounded-lg flex items-center justify-center text-[8px] font-black text-white">JOIN</div>
                      <div className="w-8 h-6 bg-red-500/10 rounded-lg flex items-center justify-center text-[8px] font-black text-red-500">VS</div>
                  </div>
              </div>
          </div>
      )
    },
    {
      title: "Customizable Layout",
      desc: "Your HUD, your rules. Click 'Customize Layout' to drag and drop panels. Reset anytime if you get lost.",
      icon: <Activity size={48} className="text-green-500" />,
      visual: (
          <div className="w-40 h-24 relative bg-md-sys-surface3 rounded-xl border-2 border-dashed border-md-sys-outline/30 flex items-center justify-center">
              <div className="absolute top-2 left-2 p-1 bg-md-sys-surface1 rounded shadow-sm">
                  <GripVertical size={12}/>
              </div>
              <span className="text-[10px] opacity-50 font-bold uppercase">Drag Me</span>
          </div>
      )
    },
    {
        title: "Deep Analytics",
        desc: "Analyze your performance. Use 'Pro Mode' for dense data tables, or click any chart bar to see detailed history for that specific ship or hero.",
        icon: <Activity size={48} className="text-purple-500" />,
        visual: (
            <div className="flex gap-2 items-end h-16">
                <div className="w-4 h-8 bg-purple-500/40 rounded-t"></div>
                <div className="w-4 h-12 bg-purple-500/70 rounded-t"></div>
                <div className="w-4 h-16 bg-purple-500 rounded-t"></div>
                <div className="w-4 h-10 bg-purple-500/50 rounded-t"></div>
            </div>
        )
    },
    {
      title: "Mini-Mode Overlay",
      desc: "Stay in the game. Toggle the compact overlay by clicking the icon in the header or pressing F9 at any time.",
      icon: <Zap size={48} className="text-cyan-400" />,
      visual: (
          <div className="w-24 h-32 bg-md-sys-surface1 rounded-lg border-2 border-md-sys-primary flex flex-col items-center justify-center p-2 shadow-xl">
              <div className="w-full h-1 bg-md-sys-primary/40 rounded mb-4"></div>
              <div className="w-12 h-12 bg-md-sys-primary/20 rounded-full flex items-center justify-center">
                  <Zap size={20} className="text-md-sys-primary"/>
              </div>
          </div>
      )
    },
    {
      title: "Phased Workflow",
      desc: "The overlay guides you through the match: Setup your loadout, track Live mission time, and log Results instantly after extraction.",
      icon: <CheckCircle size={48} className="text-green-500" />,
      visual: (
          <div className="flex gap-2 items-center">
              <div className="w-10 h-10 rounded bg-green-500/20 flex items-center justify-center text-[10px] font-bold">1</div>
              <ChevronRight size={16} className="opacity-30"/>
              <div className="w-10 h-10 rounded bg-green-500/50 flex items-center justify-center text-[10px] font-bold">2</div>
              <ChevronRight size={16} className="opacity-30"/>
              <div className="w-10 h-10 rounded bg-green-500 flex items-center justify-center text-[10px] font-bold">3</div>
          </div>
      )
    },
    {
      title: "Auto Log Recording",
      desc: "Automatically detects match starts from local game logs. Enable this experimental feature in Settings to track your missions without manual input.",
      icon: <Activity size={48} className="text-pink-500" />,
      visual: (
          <div className="w-24 h-24 bg-md-sys-surface1 rounded-full border-2 border-pink-500/50 flex flex-col items-center justify-center relative">
              <div className="w-16 h-1 bg-pink-500/20 rounded mb-2 animate-pulse"></div>
              <div className="w-12 h-1 bg-pink-500/40 rounded mb-2 animate-pulse delay-75"></div>
              <div className="w-8 h-1 bg-pink-500/60 rounded animate-pulse delay-150"></div>
              <div className="absolute top-2 right-4 w-2 h-2 bg-pink-500 rounded-full animate-ping"></div>
          </div>
      )
    },
    {
      title: "Smart Capture & OCR",
      desc: "Capture your screen mid-match to auto-detect teammates, opponents, ship types, and hazards. Review and correct OCR results before applying them to your session.",
      icon: <Camera size={48} className="text-orange-400" />,
      visual: (
          <div className="w-40 h-28 bg-md-sys-surface1 rounded-xl border-2 border-orange-400/50 flex flex-col items-center justify-center relative overflow-hidden">
              <Camera size={28} className="text-orange-400 mb-2" />
              <div className="w-full flex flex-col gap-1 px-3">
                  <div className="h-1 bg-orange-400/30 rounded w-full animate-pulse"></div>
                  <div className="h-1 bg-orange-400/50 rounded w-3/4 animate-pulse delay-75"></div>
                  <div className="h-1 bg-orange-400/70 rounded w-1/2 animate-pulse delay-150"></div>
              </div>
              <div className="absolute top-1 right-1 w-6 h-6 bg-orange-400/20 rounded-full flex items-center justify-center">
                  <div className="w-2 h-2 bg-orange-400 rounded-full"></div>
              </div>
          </div>
      )
    }
  ];

  const handleNext = () => {
    if (step < steps.length - 1) {
      setStep(step + 1);
    } else {
      onComplete();
    }
  };

  const handlePrev = () => {
    if (step > 0) setStep(step - 1);
  };

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-md z-[1000] flex items-center justify-center p-4 animate-fade-in">
      <div className="bg-md-sys-surface1 max-w-lg w-full rounded-[32px] p-8 shadow-2xl border border-md-sys-outline/20 relative elevation-2 animate-scale-in flex flex-col items-center text-center">
        
        <button onClick={onSkip} className="absolute top-6 right-6 p-2 hover:bg-md-sys-surface2 rounded-full transition-colors text-md-sys-outline">
            <X size={24} />
        </button>

        {/* Visual Header */}
        <div className="mb-6 w-full h-32 bg-md-sys-surface2 rounded-2xl flex items-center justify-center border border-md-sys-outline/5 overflow-hidden relative">
            <div className="absolute inset-0 bg-gradient-to-b from-transparent to-md-sys-surface1/10"></div>
            {steps[step].visual}
        </div>

        <h2 className="text-2xl font-black uppercase tracking-tight mb-4 text-md-sys-on-surface">{steps[step].title}</h2>
        <p className="text-sm opacity-80 leading-relaxed mb-8 max-w-md">{steps[step].desc}</p>

        <div className="flex gap-2 mb-8">
            {steps.map((_, i) => (
                <div key={i} className={`h-1.5 rounded-full transition-all duration-300 ${i === step ? 'w-8 bg-md-sys-primary' : 'w-2 bg-md-sys-outline/30'}`} />
            ))}
        </div>

        <div className="flex w-full gap-4">
            <button 
                onClick={step === 0 ? onSkip : handlePrev} 
                className="px-6 py-3 rounded-xl font-bold transition-all text-md-sys-on-surface hover:bg-md-sys-surface2"
            >
                {step === 0 ? 'Skip' : 'Back'}
            </button>
            <button 
                onClick={handleNext}
                className="flex-1 bg-md-sys-primary text-md-sys-onPrimary px-6 py-3 rounded-xl font-black uppercase tracking-widest hover:brightness-110 transition-all elevation-1 flex items-center justify-center gap-2"
            >
                {step === steps.length - 1 ? (
                    <>Get Started <CheckCircle size={18}/></>
                ) : (
                    <>Next <ChevronRight size={18}/></>
                )}
            </button>
        </div>

      </div>
    </div>
  );
};

export default Tutorial;
