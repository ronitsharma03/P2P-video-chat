import { Github, Twitter, Linkedin, Mail, Globe } from 'lucide-react';

const Footer = () => {
  const currentYear = new Date().getFullYear();
  
  return (
    <footer className="bg-gray-800 text-white mt-auto">
      <div className="max-w-6xl mx-auto py-8 px-4">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          {/* About Section */}
          <div>
            <h3 className="text-lg font-semibold mb-4">Random Video Chat</h3>
            <p className="text-gray-300 text-sm">
              Connect with people from around the world in a secure and 
              easy-to-use platform. Meet new friends, practice languages, 
              or just have fun conversations.
            </p>
          </div>
          
          {/* Quick Links */}
          <div>
            <h3 className="text-lg font-semibold mb-4">Quick Links</h3>
            <ul className="space-y-2 text-gray-300 text-sm">
              <li><a href="#" className="hover:text-blue-400 transition-colors">Terms of Service</a></li>
              <li><a href="#" className="hover:text-blue-400 transition-colors">Community Guidelines</a></li>
            </ul>
          </div>
          
          {/* Social Links */}
          <div>
            <h3 className="text-lg font-semibold mb-4">Connect With Me</h3>
            <div className="flex space-x-5 mb-6">
              <a href="https://github.com/ronitsharma03" className="text-gray-300 hover:text-white transition-colors">
                <Github size={20} />
              </a>
              <a href="https://twitter.com/ronitification" className="text-gray-300 hover:text-white transition-colors">
                <Twitter size={20} />
              </a>
              <a href="https://linkedin.com/in/ronit-khajuria-394609228/" className="text-gray-300 hover:text-white transition-colors">
                <Linkedin size={20} />
              </a>
              <a href="mailto:devxronit03@gmail.com" className="text-gray-300 hover:text-white transition-colors">
                <Mail size={20} />
              </a>
              <a href="https://ronitkhajuria.tech" className="text-gray-300 hover:text-white transition-colors">
                <Globe size={20} />
              </a>
            </div>
          </div>
        </div>
        
        {/* Copyright */}
        <div className="border-t border-gray-700 mt-8 pt-6 text-center">
          <p className="text-sm text-gray-400">
            &copy; {currentYear} ronitkhajuria.tech. All rights reserved.
          </p>
        </div>
      </div>
    </footer>
  );
};

export default Footer;