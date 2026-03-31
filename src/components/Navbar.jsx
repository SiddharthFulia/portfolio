import { NavLink } from "react-router-dom";
import { logo } from "../assets/images";

const Navbar = () => {
  return (
    <header className='header'>
      <NavLink to='/'>
        <img src={logo} alt='logo' className='w-16 h-16 object-contain' />
      </NavLink>
      <nav className='flex items-center text-lg gap-7 font-medium'>
        <NavLink to='/about' className={({ isActive }) => isActive ? "text-blue-600" : "text-black"}>
          About
        </NavLink>
        <NavLink to='/projects' className={({ isActive }) => isActive ? "text-blue-600" : "text-black"}>
          Projects
        </NavLink>
        <NavLink to='/lab' className={({ isActive }) =>
          isActive
            ? "text-sm px-4 py-2 rounded-lg text-black font-semibold bg-cyan-400 shadow-md"
            : "text-sm px-4 py-2 rounded-lg text-white font-semibold bg-gray-900 hover:bg-gray-800 transition-colors"
        }>
          ⚗ Lab
        </NavLink>
        <a
          href="/resume.pdf"
          target="_blank"
          rel="noreferrer"
          className="text-sm px-4 py-2 rounded-lg text-white font-semibold
                     bg-gradient-to-r from-[#00c6ff] to-[#0072ff]
                     hover:opacity-90 hover:scale-105 transition-transform duration-150 shadow-sm"
        >
          Resume
        </a>
      </nav>
    </header>
  );
};

export default Navbar;
