import { Video } from "lucide-react";

const Navbar = () => {
  return (
    <nav className="bg-white shadow-md py-4 px-6">
      <div className="max-w-6xl mx-auto flex flex-wrap items-center justify-between">
        {/* Logo and Brand */}
        <div className="flex items-center">
          <Video className="h-8 w-8 text-blue-600 mr-2" />
          <a href="/">
            <span className="font-bold text-xl text-gray-800">Random Meet</span>
          </a>
        </div>

        {/* Navigation Links - Responsive */}
        <div className="hidden md:flex items-center space-x-6">
          <a
            href="https://ronitkhajuria.tech"
            target="_blank"
            className="text-gray-600 hover:text-blue-600 transition-colors"
          >
            Contact
          </a>
        </div>

        {/* Mobile Menu Button */}
        <div className="md:hidden">
          <button className="flex items-center p-2 rounded-md text-gray-600 hover:text-blue-600 hover:bg-gray-100">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className="h-6 w-6"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M4 6h16M4 12h16M4 18h16"
              />
            </svg>
          </button>
        </div>
      </div>

      {/* Mobile Menu (hidden by default) */}
      <div className="md:hidden hidden">
        <div className="px-2 pt-2 pb-3 space-y-1 sm:px-3">
          <a
            href="#"
            className="block px-3 py-2 rounded-md text-base font-medium text-gray-600 hover:text-blue-600 hover:bg-gray-100"
          >
            Home
          </a>
          <a
            href="#"
            className="block px-3 py-2 rounded-md text-base font-medium text-gray-600 hover:text-blue-600 hover:bg-gray-100"
          >
            How It Works
          </a>
          <a
            href="#"
            className="block px-3 py-2 rounded-md text-base font-medium text-gray-600 hover:text-blue-600 hover:bg-gray-100"
          >
            Safety
          </a>
          <a
            href="#"
            className="block px-3 py-2 rounded-md text-base font-medium text-gray-600 hover:text-blue-600 hover:bg-gray-100"
          >
            About
          </a>
        </div>
      </div>
    </nav>
  );
};

export default Navbar;
