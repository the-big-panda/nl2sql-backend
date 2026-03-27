class ChromaService {
  constructor(aiServiceUrl = 'http://localhost:9001') {
    this.aiServiceUrl = aiServiceUrl;
  }

  async updateWorkspaceSchema(workspaceId, tableDetails, dbType) {
    try {
      console.log(`Updating ChromaDB schema for workspace ${workspaceId}`);
      
      const response = await fetch(`${this.aiServiceUrl}/update-schema`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          workspaceId: workspaceId.toString(),
          tables: tableDetails,
          dbType
        })
      });

      const data = await response.json();

      if (data.success) {
        console.log(`✅ Successfully updated schema for workspace ${workspaceId}`);
        return { success: true, updatedTables: data.updatedTables };
      } else {
        throw new Error(data.error || 'Failed to update schema');
      }
    } catch (error) {
      console.error(`❌ Error updating ChromaDB schema for workspace ${workspaceId}:`, error.message);
      return { success: false, error: error.message };
    }
  }

  async searchRelevantSchemas(workspaceId, question, maxResults = 5) {
    try {
      console.log(`Searching relevant schemas for workspace ${workspaceId}`);
      
      const response = await fetch(`${this.aiServiceUrl}/search-schemas`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          workspaceId: workspaceId.toString(),
          question,
          maxResults
        })
      });

      const data = await response.json();

      if (data.success) {
        console.log(`✅ Found ${data.results.length} relevant schemas`);
        return { 
          success: true, 
          results: data.results,
          contextSchema: data.contextSchema 
        };
      } else {
        throw new Error(data.error || 'Failed to search schemas');
      }
    } catch (error) {
      console.error(`❌ Error searching schemas for workspace ${workspaceId}:`, error.message);
      return { success: false, error: error.message, results: [] };
    }
  }

  async deleteWorkspaceData(workspaceId) {
    try {
      console.log(`Deleting ChromaDB data for workspace ${workspaceId}`);
      
      const response = await fetch(`${this.aiServiceUrl}/workspace/${workspaceId}/schemas`, {
        method: 'DELETE'
      });

      const data = await response.json();

      if (data.success) {
        console.log(`✅ Successfully deleted ChromaDB data for workspace ${workspaceId}`);
        return { success: true };
      } else {
        throw new Error(data.error || 'Failed to delete workspace data');
      }
    } catch (error) {
      console.error(`❌ Error deleting ChromaDB data for workspace ${workspaceId}:`, error.message);
      return { success: false, error: error.message };
    }
  }

  async getWorkspaceStats(workspaceId) {
    try {
      const response = await fetch(`${this.aiServiceUrl}/workspace/${workspaceId}/stats`);
      
      const data = await response.json();

      if (data.success) {
        return { success: true, stats: data.stats };
      } else {
        throw new Error(data.error || 'Failed to get workspace stats');
      }
    } catch (error) {
      console.error(`❌ Error getting stats for workspace ${workspaceId}:`, error.message);
      return { success: false, error: error.message };
    }
  }
}

module.exports = ChromaService;
