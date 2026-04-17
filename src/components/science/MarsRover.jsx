import { Link } from 'react-router-dom';

const MarsRover = () => {
  return (
    <div className="space-y-6">
      <div className="p-6 bg-gray-800/50 border border-gray-700 rounded-2xl">
        <div className="flex items-start gap-4">
          <div className="w-12 h-12 rounded-xl bg-red-900/30 flex items-center justify-center shrink-0">
            <svg className="w-6 h-6 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
            </svg>
          </div>
          <div>
            <h3 className="text-white font-bold text-lg mb-2">Mars Rover Photos API — Retired</h3>
            <p className="text-gray-400 text-sm leading-relaxed mb-4">
              The Mars Rover Photos API was maintained as a community project since 2014 and has been officially archived.
              The endpoints no longer return data.
            </p>
            <p className="text-gray-500 text-sm mb-4">
              You can still browse Mars rover images through the Media Library:
            </p>
            <div className="flex flex-wrap gap-3">
              <Link
                to="/science/media"
                className="inline-flex items-center gap-2 px-4 py-2 bg-red-600 hover:bg-red-500 text-white text-sm font-semibold rounded-lg transition-colors"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
                </svg>
                Search "Mars Rover" in Media Library
              </Link>
            </div>
          </div>
        </div>
      </div>

      {/* Show some context about the rovers */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {[
          { name: 'Curiosity', landed: 'Aug 6, 2012', status: 'Active', sol: '4000+', color: 'border-orange-500/30' },
          { name: 'Perseverance', landed: 'Feb 18, 2021', status: 'Active', sol: '1000+', color: 'border-blue-500/30' },
          { name: 'Opportunity', landed: 'Jan 25, 2004', status: 'Complete', sol: '5,352', color: 'border-green-500/30' },
          { name: 'Spirit', landed: 'Jan 4, 2004', status: 'Complete', sol: '2,208', color: 'border-purple-500/30' },
        ].map(r => (
          <div key={r.name} className={`p-4 bg-gray-900 border ${r.color} rounded-xl`}>
            <div className="flex items-center justify-between mb-2">
              <span className="text-white font-bold">{r.name}</span>
              <span className={`text-xs px-2 py-0.5 rounded ${r.status === 'Active' ? 'bg-green-900/40 text-green-400' : 'bg-gray-800 text-gray-500'}`}>
                {r.status}
              </span>
            </div>
            <div className="text-gray-500 text-xs space-y-1">
              <div>Landed: <span className="text-gray-400">{r.landed}</span></div>
              <div>Sols: <span className="text-gray-400">{r.sol}</span></div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default MarsRover;
