from flask import Flask, jsonify, request
from flask_cors import CORS
from flask_sqlalchemy import SQLAlchemy
from datetime import datetime
import os
from collections import defaultdict
import requests

app = Flask(__name__)
CORS(app, origins=[
    "chrome-extension://*",
    "http://localhost:*",
    "https://underdogfantasy.com",
    "https://app.underdogfantasy.com",
    "https://*.underdogfantasy.com"
])

# Database configuration - handle Railway's postgres:// URL
database_url = os.environ.get('DATABASE_URL')
if database_url:
    # Railway uses postgres:// but SQLAlchemy needs postgresql://
    if database_url.startswith('postgres://'):
        database_url = database_url.replace('postgres://', 'postgresql://', 1)
    app.config['SQLALCHEMY_DATABASE_URI'] = database_url
else:
    # Fallback for local development only
    app.config['SQLALCHEMY_DATABASE_URI'] = 'postgresql://postgres:password@localhost:5432/underdog_dfs'

app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False

db = SQLAlchemy(app)

# Database Models
class Player(db.Model):
    __tablename__ = 'players'
    
    id = db.Column(db.Integer, primary_key=True)
    appearance_id = db.Column(db.String(100), index=True)  # ETR 'id' field
    name = db.Column(db.String(100), nullable=False, index=True)
    position = db.Column(db.String(10))
    team = db.Column(db.String(10))
    opponent = db.Column(db.String(10))
    etr_projection = db.Column(db.Float, default=0)
    market_projection = db.Column(db.Float, default=0)
    adp = db.Column(db.Float, default=999)
    last_updated = db.Column(db.DateTime, default=datetime.utcnow)
    
    __table_args__ = (
        db.Index('idx_player_lookup', 'name', 'appearance_id'),
    )

class Draft(db.Model):
    __tablename__ = 'drafts'
    
    id = db.Column(db.Integer, primary_key=True)
    draft_id = db.Column(db.String(100), unique=True, nullable=False)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    total_entries = db.Column(db.Integer)
    completed = db.Column(db.Boolean, default=False)

class Pick(db.Model):
    __tablename__ = 'picks'
    
    id = db.Column(db.Integer, primary_key=True)
    draft_id = db.Column(db.String(100), nullable=False, index=True)
    appearance_id = db.Column(db.String(100), nullable=False)
    player_name = db.Column(db.String(100))
    pick_number = db.Column(db.Integer)
    draft_entry_id = db.Column(db.String(100))
    user_id = db.Column(db.String(100))
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    
    __table_args__ = (
        db.Index('idx_draft_pick', 'draft_id', 'pick_number'),
    )

class Team(db.Model):
    __tablename__ = 'teams'
    
    id = db.Column(db.Integer, primary_key=True)
    draft_id = db.Column(db.String(100), nullable=False)
    user_id = db.Column(db.String(100))
    entry_id = db.Column(db.String(100))
    players = db.Column(db.Text)  # Comma-separated appearance_ids
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    
    __table_args__ = (
        db.Index('idx_team_lookup', 'draft_id', 'entry_id'),
    )

with app.app_context():
    db.create_all()

# Initialize database only when running directly
if __name__ == '__main__':
    port = int(os.environ.get('PORT', 5000))
    app.run(host='0.0.0.0', port=port)

# API Routes
@app.route('/api/projections', methods=['GET'])
def get_projections():
    """Get projections based on type (market or etr)"""
    proj_type = request.args.get('type', 'etr')
    
    if proj_type == 'market':
        # Return market projections if available
        players = Player.query.filter(Player.market_projection > 0).all()
        projections = [
            {
                'name': p.name,
                'projection': p.market_projection,
                'position': p.position,
                'team': p.team,
                'id': p.appearance_id  # Include ID for matching
            }
            for p in players
        ]
    else:
        # Return ETR projections
        players = Player.query.filter(Player.etr_projection > 0).all()
        projections = [
            {
                'name': p.name,
                'projection': p.etr_projection,
                'position': p.position,
                'team': p.team,
                'id': p.appearance_id  # Include ID for matching
            }
            for p in players
        ]
    
    return jsonify(projections)

@app.route('/api/init-db', methods=['POST'])
def init_database():
    """Initialize database tables"""
    try:
        db.create_all()
        return jsonify({'success': True, 'message': 'Database initialized'})
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/picks', methods=['POST'])
def save_pick():
    """Save a pick from any draft"""
    data = request.json
    
    # Check if draft exists
    draft = Draft.query.filter_by(draft_id=data['draftId']).first()
    if not draft:
        draft = Draft(draft_id=data['draftId'])
        db.session.add(draft)
    
    # Extract pick data (handle both string and object format from Pusher)
    pick_data = data['pick']
    if isinstance(pick_data, str):
        import json
        pick_data = json.loads(pick_data)
    
    # Save the pick
    pick = Pick(
        draft_id=data['draftId'],
        appearance_id=pick_data.get('appearance_id', ''),
        pick_number=pick_data.get('number', len(Pick.query.filter_by(draft_id=data['draftId']).all()) + 1),
        draft_entry_id=pick_data.get('draft_entry_id', ''),
        user_id=pick_data.get('user_id', ''),
        player_name=pick_data.get('player_name', '')
    )
    db.session.add(pick)
    
    # Check if draft is complete (36 picks for 6-person, 72 for 12-person)
    pick_count = Pick.query.filter_by(draft_id=data['draftId']).count() + 1
    if pick_count >= 36:  # Assuming 6-person draft for now
        draft.completed = True
        draft.total_entries = 6
        # Save completed teams
        save_completed_teams(data['draftId'])
    
    db.session.commit()
    return jsonify({'success': True})

@app.route('/api/debug-db', methods=['GET'])
def debug_db():
    """Debug database connection"""
    return jsonify({
        'database_url_exists': bool(os.environ.get('DATABASE_URL')),
        'database_url_starts_with': os.environ.get('DATABASE_URL', 'NOT SET')[:20] if os.environ.get('DATABASE_URL') else 'NOT SET',
        'all_env_vars': list(os.environ.keys())
    })

def save_completed_teams(draft_id):
    """Save completed teams for duplication checking"""
    picks = Pick.query.filter_by(draft_id=draft_id).order_by(Pick.pick_number).all()
    
    # Group picks by entry ID if available
    teams_by_entry = defaultdict(list)
    
    # If we have entry IDs, use them
    if any(pick.draft_entry_id for pick in picks):
        for pick in picks:
            if pick.draft_entry_id:
                teams_by_entry[pick.draft_entry_id].append(pick.appearance_id)
    else:
        # Fallback to snake draft position calculation
        num_entries = 6  # Default, should be detected from draft
        for i, pick in enumerate(picks):
            round_num = i // num_entries
            pos_in_round = i % num_entries
            
            if round_num % 2 == 0:  # Even round (forward)
                entry_pos = pos_in_round
            else:  # Odd round (backward)
                entry_pos = num_entries - pos_in_round - 1
            
            teams_by_entry[f"pos_{entry_pos}"].append(pick.appearance_id)
    
    # Save each team
    for entry_id, player_ids in teams_by_entry.items():
        if len(player_ids) == 6:  # Only save complete teams
            team = Team(
                draft_id=draft_id,
                entry_id=entry_id,
                players=','.join(sorted(player_ids))  # Sort for consistent comparison
            )
            db.session.add(team)

@app.route('/api/exposures', methods=['GET'])
def get_exposures():
    """Get exposure percentages for all players"""
    # Count total completed drafts
    total_drafts = Draft.query.filter_by(completed=True).count()
    if total_drafts == 0:
        return jsonify({})
    
    # Count player appearances across all drafts
    player_counts = db.session.query(
        Pick.appearance_id,
        db.func.count(db.distinct(Pick.draft_id))
    ).group_by(Pick.appearance_id).all()
    
    exposures = {}
    for player_id, count in player_counts:
        if player_id:  # Skip empty IDs
            exposures[player_id] = round((count / total_drafts) * 100, 1)
    
    return jsonify(exposures)

@app.route('/api/check-duplication', methods=['POST'])
def check_duplication():
    """Check how many similar teams exist"""
    data = request.json
    current_picks = set(data['picks'])
    
    if len(current_picks) < 4:  # Not enough picks to check
        return jsonify({'similarCount': 0})
    
    # Get all completed teams
    teams = Team.query.all()
    
    similar_count = 0
    for team in teams:
        team_players = set(team.players.split(','))
        overlap = len(current_picks & team_players)
        
        # Count as similar if 5+ players match (allowing 1 different)
        if overlap >= min(5, len(current_picks)):
            similar_count += 1
    
    return jsonify({'similarCount': similar_count})

@app.route('/api/upload-etr', methods=['POST'])
def upload_etr_projections():
    """Upload ETR projections from CSV"""
    try:
        data = request.json
        players_data = data.get('players', [])
        
        if not players_data:
            return jsonify({'error': 'No player data provided'}), 400
        
        updated_count = 0
        
        for player_data in players_data:
            # Try to find player by ETR id first, then by name
            player = None
            
            if player_data.get('id'):
                player = Player.query.filter_by(appearance_id=player_data['id']).first()
            
            if not player and player_data.get('name'):
                player = Player.query.filter_by(name=player_data['name']).first()
            
            if not player:
                # Create new player
                player = Player(
                    name=player_data['name'],
                    appearance_id=player_data.get('id', '')
                )
                db.session.add(player)
            
            # Update player data
            player.etr_projection = float(player_data.get('projection', 0))
            player.position = player_data.get('position', player.position if player else '')
            player.team = player_data.get('team', player.team if player else '')
            player.opponent = player_data.get('opponent', '')
            player.adp = float(player_data.get('adp', 999))
            player.last_updated = datetime.utcnow()
            
            # Update appearance_id if provided
            if player_data.get('id'):
                player.appearance_id = player_data['id']
            
            updated_count += 1
        
        db.session.commit()
        return jsonify({'success': True, 'count': updated_count})
        
    except Exception as e:
        db.session.rollback()
        return jsonify({'error': str(e)}), 400
    
@app.route('/api/upload-market', methods=['POST'])
def upload_market_projections():
    """Upload market-based projections"""
    try:
        data = request.json
        players_data = data.get('players', [])
        
        if not players_data:
            return jsonify({'error': 'No player data provided'}), 400
        
        updated_count = 0
        
        for player_data in players_data:
            # Find player by name
            player = Player.query.filter_by(name=player_data['name']).first()
            
            if not player:
                # Create new player if doesn't exist
                player = Player(name=player_data['name'])
                db.session.add(player)
            
            # Update market projection
            player.market_projection = float(player_data.get('projection', 0))
            player.last_updated = datetime.utcnow()
            
            updated_count += 1
        
        db.session.commit()
        return jsonify({'success': True, 'count': updated_count})
        
    except Exception as e:
        db.session.rollback()
        return jsonify({'error': str(e)}), 400

@app.route('/api/stats', methods=['GET'])
def get_stats():
    """Get overall statistics"""
    stats = {
        'total_drafts': Draft.query.count(),
        'completed_drafts': Draft.query.filter_by(completed=True).count(),
        'total_picks': Pick.query.count(),
        'unique_players': db.session.query(db.func.count(db.distinct(Pick.appearance_id))).scalar() or 0,
        'total_teams': Team.query.count()
    }
    return jsonify(stats)

@app.route('/api/health', methods=['GET'])
def health_check():
    """Health check endpoint"""
    return jsonify({
        'status': 'healthy',
        'timestamp': datetime.utcnow().isoformat()
    })

if __name__ == '__main__':
    port = int(os.environ.get('PORT', 5000))
    app.run(host='0.0.0.0', port=port)