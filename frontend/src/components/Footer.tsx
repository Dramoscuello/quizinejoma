export default function Footer() {
  return (
    <footer className="w-full py-8 border-t border-[#e6e2da]/40 mt-auto bg-transparent">
      <div className="max-w-[1120px] mx-auto px-6 md:px-12 flex flex-col md:flex-row justify-between items-center gap-4 text-[#737373] text-xs">
        <div className="font-bold text-[#171818] text-sm">
          QuizInejoma
        </div>
        <div className="text-[#444748]">
          © {new Date().getFullYear()} QuizInejoma. Academic Excellence.
        </div>
        <div className="flex gap-6">
          <span className="hover:text-[#171818] cursor-pointer transition-colors">Privacidad</span>
          <span className="hover:text-[#171818] cursor-pointer transition-colors">Términos</span>
          <span className="hover:text-[#171818] cursor-pointer transition-colors">Soporte</span>
        </div>
      </div>
    </footer>
  );
}
