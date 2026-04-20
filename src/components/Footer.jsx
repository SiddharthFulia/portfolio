import { Link, useLocation } from "react-router-dom";
import { socialLinks } from "../constants";

const DARK_ROUTES = ['/lab', '/learn', '/creative', '/chess', '/science', '/face', '/explore', '/ai'];

const Footer = () => {
  const { pathname } = useLocation();
  const isDark = DARK_ROUTES.some(r => pathname.startsWith(r));

  return (
    <footer className={`font-poppins transition-colors duration-300 ${
      isDark ? 'bg-gray-950' : ''
    }`}>
      <div className="max-w-5xl mx-auto sm:px-16 pb-6 px-8 flex flex-col gap-7">
        <hr className={`${isDark ? 'border-gray-800' : 'border-slate-200'}`} />
        <div className="flex flex-wrap gap-7 items-center justify-between">
          <p className={isDark ? 'text-gray-400' : ''}>
            © 2026 <strong className={isDark ? 'text-gray-200' : ''}>Siddharth Fulia</strong>. All rights reserved.
          </p>
          <div className="flex gap-3 justify-center items-center">
            {socialLinks.map((link) => (
              <Link key={link.name} to={link.link} target="_blank">
                <img
                  src={link.iconUrl}
                  alt={link.name}
                  className={`w-6 h-6 object-contain ${isDark ? 'brightness-75 hover:brightness-100 transition-all' : ''}`}
                />
              </Link>
            ))}
          </div>
        </div>
      </div>
    </footer>
  );
};

export default Footer;
