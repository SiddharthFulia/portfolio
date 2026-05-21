import { useState } from 'react'
import {
  CheckCircle2,
  Circle,
  CircleAlert,
  CircleDotDashed,
  CircleX,
} from 'lucide-react'
import { motion, AnimatePresence, LayoutGroup } from 'framer-motion'

/**
 * AgentPlan — read-only-friendly tree of tasks → subtasks with
 * framer-motion expand / collapse animations.
 *
 * Props:
 *   tasks                 Array of { id, title, description?, status, subtasks?: [{id, title, description?, status, tools?}] }
 *                         status ∈ 'completed' | 'in-progress' | 'pending' | 'need-help' | 'failed'
 *   defaultExpandedIds    Optional array of task ids to expand initially. Defaults to the first task.
 *   onToggleTaskStatus    Optional (taskId) => void — clicking the task icon calls this. If omitted, icon is read-only.
 *   onToggleSubtaskStatus Optional (taskId, subtaskId) => void — same for subtasks.
 *   className             Optional extra classes on the outer wrapper.
 */
export default function AgentPlan({
  tasks = [],
  defaultExpandedIds,
  onToggleTaskStatus,
  onToggleSubtaskStatus,
  className = '',
}) {
  const initialExpanded =
    defaultExpandedIds ||
    (tasks.length > 0 ? [tasks[0].id] : [])

  const [expandedTasks, setExpandedTasks] = useState(initialExpanded)
  const [expandedSubtasks, setExpandedSubtasks] = useState({})

  // Reduced-motion preference — honour the OS setting so the animation
  // gracefully collapses to instant transitions.
  const prefersReducedMotion =
    typeof window !== 'undefined'
      ? window.matchMedia('(prefers-reduced-motion: reduce)').matches
      : false

  const toggleTaskExpansion = (taskId) => {
    setExpandedTasks((prev) =>
      prev.includes(taskId)
        ? prev.filter((id) => id !== taskId)
        : [...prev, taskId],
    )
  }

  const toggleSubtaskExpansion = (taskId, subtaskId) => {
    const key = `${taskId}-${subtaskId}`
    setExpandedSubtasks((prev) => ({ ...prev, [key]: !prev[key] }))
  }

  // Animation variants
  const taskVariants = {
    hidden: { opacity: 0, y: prefersReducedMotion ? 0 : -5 },
    visible: {
      opacity: 1,
      y: 0,
      transition: {
        type: prefersReducedMotion ? 'tween' : 'spring',
        stiffness: 500,
        damping: 30,
        duration: prefersReducedMotion ? 0.2 : undefined,
      },
    },
    exit: {
      opacity: 0,
      y: prefersReducedMotion ? 0 : -5,
      transition: { duration: 0.15 },
    },
  }

  const subtaskListVariants = {
    hidden: { opacity: 0, height: 0, overflow: 'hidden' },
    visible: {
      height: 'auto',
      opacity: 1,
      overflow: 'visible',
      transition: {
        duration: 0.25,
        staggerChildren: prefersReducedMotion ? 0 : 0.05,
        when: 'beforeChildren',
        ease: [0.2, 0.65, 0.3, 0.9],
      },
    },
    exit: {
      height: 0,
      opacity: 0,
      overflow: 'hidden',
      transition: { duration: 0.2, ease: [0.2, 0.65, 0.3, 0.9] },
    },
  }

  const subtaskVariants = {
    hidden: { opacity: 0, x: prefersReducedMotion ? 0 : -10 },
    visible: {
      opacity: 1,
      x: 0,
      transition: {
        type: prefersReducedMotion ? 'tween' : 'spring',
        stiffness: 500,
        damping: 25,
        duration: prefersReducedMotion ? 0.2 : undefined,
      },
    },
    exit: {
      opacity: 0,
      x: prefersReducedMotion ? 0 : -10,
      transition: { duration: 0.15 },
    },
  }

  const subtaskDetailsVariants = {
    hidden: { opacity: 0, height: 0, overflow: 'hidden' },
    visible: {
      opacity: 1,
      height: 'auto',
      overflow: 'visible',
      transition: { duration: 0.25, ease: [0.2, 0.65, 0.3, 0.9] },
    },
  }

  const statusBadgeVariants = {
    initial: { scale: 1 },
    animate: {
      scale: prefersReducedMotion ? 1 : [1, 1.08, 1],
      transition: { duration: 0.35, ease: [0.34, 1.56, 0.64, 1] },
    },
  }

  // Status → status badge classes (dark theme — bg-tinted with light text)
  const statusBadgeClass = (status) => {
    switch (status) {
      case 'completed':
        return 'bg-green-500/20 text-green-300 border border-green-500/30'
      case 'in-progress':
        return 'bg-blue-500/20 text-blue-300 border border-blue-500/30'
      case 'need-help':
        return 'bg-yellow-500/20 text-yellow-300 border border-yellow-500/30'
      case 'failed':
        return 'bg-red-500/20 text-red-300 border border-red-500/30'
      default:
        return 'bg-gray-700/60 text-gray-300 border border-gray-700'
    }
  }

  const renderStatusIcon = (status, size = 'task') => {
    const cls = size === 'task' ? 'h-4 w-4' : 'h-3.5 w-3.5'
    if (status === 'completed') return <CheckCircle2 className={`${cls} text-green-400`} />
    if (status === 'in-progress') return <CircleDotDashed className={`${cls} text-blue-400`} />
    if (status === 'need-help') return <CircleAlert className={`${cls} text-yellow-400`} />
    if (status === 'failed') return <CircleX className={`${cls} text-red-400`} />
    return <Circle className={`${cls} text-gray-500`} />
  }

  return (
    <div className={`bg-gray-950 text-gray-100 h-full overflow-auto p-2 ${className}`}>
      <motion.div
        className="bg-gray-900 border border-gray-800 rounded-lg shadow overflow-hidden"
        initial={{ opacity: 0, y: 10 }}
        animate={{
          opacity: 1,
          y: 0,
          transition: { duration: 0.3, ease: [0.2, 0.65, 0.3, 0.9] },
        }}
      >
        <LayoutGroup>
          <div className="p-4 overflow-hidden">
            <ul className="space-y-1 overflow-hidden">
              {tasks.map((task, index) => {
                const isExpanded = expandedTasks.includes(task.id)
                const isCompleted = task.status === 'completed'
                const subtasks = Array.isArray(task.subtasks) ? task.subtasks : []
                const taskClickable = !!onToggleTaskStatus

                return (
                  <motion.li
                    key={task.id}
                    className={`${index !== 0 ? 'mt-1 pt-2' : ''}`}
                    initial="hidden"
                    animate="visible"
                    variants={taskVariants}
                  >
                    {/* Task row */}
                    <motion.div
                      className="group flex items-center px-3 py-1.5 rounded-md"
                      whileHover={{
                        backgroundColor: 'rgba(255,255,255,0.03)',
                        transition: { duration: 0.2 },
                      }}
                    >
                      <motion.div
                        className={`mr-2 flex-shrink-0 ${taskClickable ? 'cursor-pointer' : ''}`}
                        onClick={(e) => {
                          if (!taskClickable) return
                          e.stopPropagation()
                          onToggleTaskStatus(task.id)
                        }}
                        whileTap={taskClickable ? { scale: 0.9 } : undefined}
                        whileHover={taskClickable ? { scale: 1.1 } : undefined}
                      >
                        <AnimatePresence mode="wait">
                          <motion.div
                            key={task.status}
                            initial={{ opacity: 0, scale: 0.8, rotate: -10 }}
                            animate={{ opacity: 1, scale: 1, rotate: 0 }}
                            exit={{ opacity: 0, scale: 0.8, rotate: 10 }}
                            transition={{ duration: 0.2, ease: [0.2, 0.65, 0.3, 0.9] }}
                          >
                            {renderStatusIcon(task.status, 'task')}
                          </motion.div>
                        </AnimatePresence>
                      </motion.div>

                      <motion.div
                        className="flex min-w-0 flex-grow cursor-pointer items-center justify-between"
                        onClick={() => toggleTaskExpansion(task.id)}
                      >
                        <div className="mr-2 flex-1 truncate">
                          <span
                            className={`text-sm ${
                              isCompleted ? 'text-gray-500 line-through' : 'text-gray-100'
                            }`}
                          >
                            {task.title}
                          </span>
                        </div>

                        <div className="flex flex-shrink-0 items-center space-x-2 text-xs">
                          <motion.span
                            className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${statusBadgeClass(task.status)}`}
                            variants={statusBadgeVariants}
                            initial="initial"
                            animate="animate"
                            key={task.status}
                          >
                            {task.status}
                          </motion.span>
                        </div>
                      </motion.div>
                    </motion.div>

                    {/* Subtasks */}
                    <AnimatePresence mode="wait">
                      {isExpanded && subtasks.length > 0 && (
                        <motion.div
                          className="relative overflow-hidden"
                          variants={subtaskListVariants}
                          initial="hidden"
                          animate="visible"
                          exit="hidden"
                          layout
                        >
                          {/* Vertical connecting line aligned with task icon */}
                          <div className="absolute top-0 bottom-0 left-[20px] border-l-2 border-dashed border-gray-700/60" />
                          <ul className="mt-1 mr-2 mb-1.5 ml-3 space-y-0.5">
                            {subtasks.map((subtask) => {
                              const subtaskKey = `${task.id}-${subtask.id}`
                              const isSubtaskExpanded = expandedSubtasks[subtaskKey]
                              const subtaskClickable = !!onToggleSubtaskStatus
                              const hasDetails =
                                !!subtask.description ||
                                (Array.isArray(subtask.tools) && subtask.tools.length > 0)

                              return (
                                <motion.li
                                  key={subtask.id}
                                  className="group flex flex-col py-0.5 pl-6"
                                  onClick={() => {
                                    if (hasDetails) toggleSubtaskExpansion(task.id, subtask.id)
                                  }}
                                  variants={subtaskVariants}
                                  initial="hidden"
                                  animate="visible"
                                  exit="exit"
                                  layout
                                >
                                  <motion.div
                                    className="flex flex-1 items-center rounded-md p-1"
                                    whileHover={{
                                      backgroundColor: 'rgba(255,255,255,0.03)',
                                      transition: { duration: 0.2 },
                                    }}
                                    layout
                                  >
                                    <motion.div
                                      className={`mr-2 flex-shrink-0 ${subtaskClickable ? 'cursor-pointer' : ''}`}
                                      onClick={(e) => {
                                        if (!subtaskClickable) return
                                        e.stopPropagation()
                                        onToggleSubtaskStatus(task.id, subtask.id)
                                      }}
                                      whileTap={subtaskClickable ? { scale: 0.9 } : undefined}
                                      whileHover={subtaskClickable ? { scale: 1.1 } : undefined}
                                      layout
                                    >
                                      <AnimatePresence mode="wait">
                                        <motion.div
                                          key={subtask.status}
                                          initial={{ opacity: 0, scale: 0.8, rotate: -10 }}
                                          animate={{ opacity: 1, scale: 1, rotate: 0 }}
                                          exit={{ opacity: 0, scale: 0.8, rotate: 10 }}
                                          transition={{
                                            duration: 0.2,
                                            ease: [0.2, 0.65, 0.3, 0.9],
                                          }}
                                        >
                                          {renderStatusIcon(subtask.status, 'subtask')}
                                        </motion.div>
                                      </AnimatePresence>
                                    </motion.div>

                                    <span
                                      className={`text-xs font-mono leading-snug break-all ${
                                        subtask.status === 'completed'
                                          ? 'text-gray-500 line-through'
                                          : 'text-gray-300'
                                      }`}
                                    >
                                      {subtask.title}
                                    </span>
                                  </motion.div>

                                  <AnimatePresence mode="wait">
                                    {isSubtaskExpanded && hasDetails && (
                                      <motion.div
                                        className="text-gray-400 border-gray-700/60 mt-1 ml-1.5 border-l border-dashed pl-5 text-xs overflow-hidden"
                                        variants={subtaskDetailsVariants}
                                        initial="hidden"
                                        animate="visible"
                                        exit="hidden"
                                        layout
                                      >
                                        {subtask.description && (
                                          <p className="py-1">{subtask.description}</p>
                                        )}
                                        {Array.isArray(subtask.tools) && subtask.tools.length > 0 && (
                                          <div className="mt-0.5 mb-1 flex flex-wrap items-center gap-1.5">
                                            <span className="text-gray-500 font-medium">
                                              Tools:
                                            </span>
                                            <div className="flex flex-wrap gap-1">
                                              {subtask.tools.map((tool, idx) => (
                                                <motion.span
                                                  key={idx}
                                                  className="bg-gray-800 text-gray-300 border border-gray-700 rounded px-1.5 py-0.5 text-[10px] font-medium shadow-sm"
                                                  initial={{ opacity: 0, y: -5 }}
                                                  animate={{
                                                    opacity: 1,
                                                    y: 0,
                                                    transition: {
                                                      duration: 0.2,
                                                      delay: idx * 0.05,
                                                    },
                                                  }}
                                                  whileHover={{
                                                    y: -1,
                                                    backgroundColor: 'rgba(255,255,255,0.06)',
                                                    transition: { duration: 0.2 },
                                                  }}
                                                >
                                                  {tool}
                                                </motion.span>
                                              ))}
                                            </div>
                                          </div>
                                        )}
                                      </motion.div>
                                    )}
                                  </AnimatePresence>
                                </motion.li>
                              )
                            })}
                          </ul>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </motion.li>
                )
              })}
            </ul>

            {tasks.length === 0 && (
              <p className="text-gray-500 text-sm text-center py-6">
                No tasks yet — waiting for activity…
              </p>
            )}
          </div>
        </LayoutGroup>
      </motion.div>
    </div>
  )
}
