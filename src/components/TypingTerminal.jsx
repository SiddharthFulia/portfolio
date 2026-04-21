import { useState, useEffect, useRef } from 'react'

const COMMANDS = [
  { prompt: '$ ', cmd: 'whoami', output: 'Siddharth Fulia — Full Stack Engineer' },
  { prompt: '$ ', cmd: 'cat skills.txt', output: 'React · Node.js · Python · Three.js · Docker · AWS · MongoDB · PostgreSQL' },
  { prompt: '$ ', cmd: 'git log --oneline -3', output: 'a1b2c3d Add 3D portfolio with Three.js\ne4f5g6h Build NASA Science Explorer\n7h8i9j0 Deploy face detection + YOLO' },
  { prompt: '$ ', cmd: 'docker ps', output: 'CONTAINER   IMAGE          STATUS\nsid-be      node:22        Up 24h\nface-svc    python:3.10    Up 24h\nollama      ollama:latest  Up 24h' },
  { prompt: '$ ', cmd: 'python train.py --model yolov8n', output: 'Epoch 1/50 ██████████ loss: 0.042 mAP: 0.89\nTraining complete. Model saved.' },
  { prompt: '$ ', cmd: 'kubectl get pods', output: 'NAME              READY   STATUS    AGE\nportfolio-web     1/1     Running   7d\napi-server        1/1     Running   7d' },
  { prompt: '$ ', cmd: 'echo "Let\'s build something amazing"', output: "Let's build something amazing 🚀" },
]

const TypingTerminal = () => {
  const [lines, setLines] = useState([])
  const [currentCmd, setCurrentCmd] = useState(0)
  const [charIdx, setCharIdx] = useState(0)
  const [phase, setPhase] = useState('typing') // 'typing' | 'output' | 'pause'
  const termRef = useRef(null)

  useEffect(() => {
    if (currentCmd >= COMMANDS.length) {
      // Restart after all commands
      const t = setTimeout(() => { setLines([]); setCurrentCmd(0); setCharIdx(0); setPhase('typing') }, 3000)
      return () => clearTimeout(t)
    }

    const cmd = COMMANDS[currentCmd]

    if (phase === 'typing') {
      if (charIdx < cmd.cmd.length) {
        const t = setTimeout(() => setCharIdx(c => c + 1), 30 + Math.random() * 40)
        return () => clearTimeout(t)
      } else {
        // Done typing, show output
        const t = setTimeout(() => setPhase('output'), 200)
        return () => clearTimeout(t)
      }
    }

    if (phase === 'output') {
      setLines(prev => [
        ...prev,
        { type: 'cmd', text: cmd.prompt + cmd.cmd },
        { type: 'output', text: cmd.output },
      ])
      setPhase('pause')
    }

    if (phase === 'pause') {
      const t = setTimeout(() => {
        setCurrentCmd(c => c + 1)
        setCharIdx(0)
        setPhase('typing')
      }, 1200)
      return () => clearTimeout(t)
    }
  }, [currentCmd, charIdx, phase])

  useEffect(() => {
    if (termRef.current) termRef.current.scrollTop = termRef.current.scrollHeight
  }, [lines, charIdx])

  const currentCmdObj = COMMANDS[currentCmd]

  return (
    <div className="bg-gray-950 rounded-xl border border-gray-800 overflow-hidden font-mono text-xs sm:text-sm">
      {/* Title bar */}
      <div className="flex items-center gap-2 px-4 py-2 bg-gray-900 border-b border-gray-800">
        <div className="flex gap-1.5">
          <div className="w-3 h-3 rounded-full bg-red-500" />
          <div className="w-3 h-3 rounded-full bg-yellow-500" />
          <div className="w-3 h-3 rounded-full bg-green-500" />
        </div>
        <span className="text-gray-500 text-[11px] ml-2">siddharth@portfolio ~ zsh</span>
      </div>

      {/* Terminal content */}
      <div ref={termRef} className="p-4 max-h-64 overflow-y-auto space-y-1">
        {lines.map((line, i) => (
          <div key={i}>
            {line.type === 'cmd' ? (
              <span className="text-green-400">{line.text}</span>
            ) : (
              <pre className="text-gray-400 whitespace-pre-wrap">{line.text}</pre>
            )}
          </div>
        ))}

        {/* Currently typing line */}
        {currentCmdObj && phase === 'typing' && (
          <div>
            <span className="text-green-400">{currentCmdObj.prompt}</span>
            <span className="text-cyan-300">{currentCmdObj.cmd.slice(0, charIdx)}</span>
            <span className="inline-block w-2 h-4 bg-cyan-400 animate-pulse ml-px" />
          </div>
        )}
      </div>
    </div>
  )
}

export default TypingTerminal
