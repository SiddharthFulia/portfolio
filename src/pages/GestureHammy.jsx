// Hammyhamster preview page. Original is a Python + MediaPipe (hand + face
// + pose) app. Browser port using tasks-vision is the follow-up — for now
// this page shows the concept + the full gesture reference so visitors
// understand the pattern.
import { useEffect } from 'react'

const GESTURES = [
  { g: 'Poker face',        trigger: 'Nothing / no match',                                 img: 'pokerham.jpg' },
  { g: 'Thumbs up',         trigger: 'Thumb up, away from your face',                      img: 'thumb.jpg' },
  { g: 'Thumbs down',       trigger: 'Thumb down, away from your face',                    img: 'thumbs down.jpg' },
  { g: 'Lollipop',          trigger: 'Closed fist beside your head',                       img: 'happylollypop.webp' },
  { g: 'Glasses',           trigger: 'Pinch (thumb + index touch) near face',              img: 'nerd.jpg' },
  { g: 'Finger near mouth', trigger: 'Index finger near mouth',                            img: 'one finger mouth .jpg' },
  { g: 'Nerd',              trigger: 'Index finger up, away from mouth',                   img: 'nerd.jpg' },
  { g: 'Bicep',             trigger: 'Bent elbow, wrist above shoulder',                   img: 'bicep.jpg' },
  { g: 'Crossed arms',      trigger: 'Both wrists together at chest height',               img: 'cross arms .jpg' },
  { g: 'Shy',               trigger: 'One hand on each cheek',                             img: 'hewo pwincess.jpg' },
  { g: 'Thinking',          trigger: 'Hands clasped at mouth / chin',                      img: 'think .jpg' },
  { g: 'Hug',               trigger: 'Hands clasped at chest height, below face',          img: 'plushie.jpg' },
  { g: 'Sad',               trigger: 'Head tilted down',                                   img: 'look down side .jpg' },
  { g: 'Truck',             trigger: 'Two hands visible, no other match',                  img: '2 arms out .jpg' },
  { g: 'Side-eye',          trigger: 'Turn head to the side',                              img: 'sideyee.jpg' },
]

export default function GestureHammy() {
  useEffect(() => { document.title = 'Hammy Hamster · Sid' }, [])
  return (
    <div className='min-h-screen bg-[var(--luxe-bg-base)] text-fg-primary pt-24 sm:pt-28 pb-16 px-3 sm:px-6'>
      <div className='max-w-6xl mx-auto'>
        <header className='mb-6'>
          <p className='eyebrow-mono mb-2 text-amber-300/80'>— Hand Gesture · MediaPipe</p>
          <h1 className='text-3xl sm:text-4xl font-bold gradient-text-amber leading-tight'>Hammy Hamster</h1>
          <p className='text-sm text-fg-muted mt-1 max-w-2xl'>
            15 face + hand + pose gestures — each maps to a hamster meme. Browser port in progress;
            the Python version at <span className='font-mono text-amber-200'>github.com/catherpiee/hammyhamster</span> runs locally today.
          </p>
        </header>

        <div className='luxe-glass p-4 sm:p-6'>
          <p className='eyebrow-mono mb-4 text-amber-300/80'>— Gesture reference</p>
          <div className='grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3'>
            {GESTURES.map(({ g, trigger, img }) => (
              <div key={g} className='luxe-glass p-2 flex flex-col gap-2'>
                <img
                  src={`/gesture-hammy/${encodeURIComponent(img)}`}
                  alt={g}
                  loading='lazy'
                  className='w-full aspect-square object-cover rounded-lg bg-black/40'
                />
                <div>
                  <p className='text-xs font-semibold text-amber-200'>{g}</p>
                  <p className='text-[10px] text-fg-muted leading-snug'>{trigger}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className='mt-6 luxe-glass p-4 text-sm text-fg-muted'>
          <p className='eyebrow-mono mb-2 text-cyan-300/80'>— Run locally</p>
          <pre className='font-mono text-xs bg-black/40 rounded-lg p-3 overflow-x-auto'>
{`git clone https://github.com/catherpiee/hammyhamster.git
cd hammyhamster
./setup.sh    # macOS
# or:
# python3 -m venv .venv && source .venv/bin/activate && pip install -r requirements.txt && python3 main.py`}
          </pre>
        </div>
      </div>
    </div>
  )
}
