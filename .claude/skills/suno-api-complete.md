

# ========== quickstart ==========

# Suno API Quickstart

>Get started with the Suno API to generate AI music, lyrics, and audio content in minutes

## Welcome to Suno API

The Suno API enables you to create high-quality AI-generated music, lyrics, and audio content using state-of-the-art AI models. Whether you're building a music app, automating creative workflows, or developing audio content, our API provides comprehensive tools for music generation and audio processing.
<CardGroup cols={3}>
  <Card
    title="Generate Music"
    icon="lucide-wand-sparkles"
    href="/suno-api/generate-music"
  >
    Create original music tracks with or without lyrics
  </Card>

  <Card
    title="Extend Music"
    icon="lucide-plus"
    href="/suno-api/extend-music"
  >
    Extend existing music tracks seamlessly
  </Card>

  <Card
    title="Generate Lyrics"
    icon="lucide-list-checks"
    href="/suno-api/generate-lyrics"
  >
    Create creative lyrics from text prompts
  </Card>

  <Card
    title="Music Videos"
    icon="lucide-video"
    href="/suno-api/create-music-video"
  >
    Convert audio tracks into visual music videos
  </Card>

  <Card
    title="Upload & Cover"
    icon="lucide-upload"
    href="/suno-api/upload-and-cover-audio"
  >
    Transform uploaded audio into new styles
  </Card>

  <Card
    title="Upload & Extend"
    icon="lucide-square-arrow-out-up-right"
    href="/suno-api/upload-and-extend-audio"
  >
    Upload audio files and extend them seamlessly
  </Card>

  <Card
    title="Add Instrumental"
    icon="lucide-music"
    href="/suno-api/add-instrumental"
  >
    Generate instrumental accompaniment for uploaded audio
  </Card>

  <Card
    title="Add Vocals"
    icon="lucide-mic"
    href="/suno-api/add-vocals"
  >
    Add vocal singing to uploaded audio files
  </Card>

  <Card
    title="Separate Vocals"
    icon="lucide-activity"
    href="/suno-api/separate-vocals"
  >
    Separate vocals and instrumentals from music
  </Card>

  <Card
    title="Convert to WAV"
    icon="lucide-file-audio"
    href="/suno-api/convert-to-wav"
  >
    Convert audio to high-quality WAV format
  </Card>

  <Card
    title="Get Lyrics"
    icon="lucide-align-left"
    href="/suno-api/get-timestamped-lyrics"
  >
    Retrieve timestamped synchronized lyrics
  </Card>
</CardGroup>

## Authentication

All API requests require authentication using a Bearer token. Get your API key from the [API Key Management Page](https://kie.ai/api-key).

:::caution[]
Keep your API key secure and never share it publicly. If compromised, reset it immediately.
:::

### API Base URL

```
https://api.kie.ai
```

### Authentication Header

```http
Authorization: Bearer YOUR_API_KEY
```

## Quick Start Guide

### Step 1: Generate Your First Music Track

Start with a simple music generation request:

<Tabs>
<TabItem value="curl" label="cURL">

```bash
curl -X POST "https://api.kie.ai/api/v1/generate" \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "prompt": "A calm and relaxing piano track with soft melodies",
    "customMode": false,
    "instrumental": true,
    "model": "V3_5",
    "callBackUrl": "https://your-app.com/callback"
  }'
```

</TabItem>
<TabItem value="javascript" label="Node.js">

```javascript
async function generateMusic() {
  try {
    const response = await fetch('https://api.kie.ai/api/v1/generate', {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer YOUR_API_KEY',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        prompt: 'A calm and relaxing piano track with soft melodies',
        customMode: false,
        instrumental: true,
        model: 'V3_5',
        callBackUrl: 'https://your-app.com/callback'
      })
    });

    const data = await response.json();
    
    if (response.ok && data.code === 200) {
      console.log('Task submitted:', data);
      console.log('Task ID:', data.data.taskId);
      return data.data.taskId;
    } else {
      console.error('Request failed:', data.msg || 'Unknown error');
      return null;
    }
  } catch (error) {
    console.error('Error:', error.message);
    return null;
  }
}

generateMusic();
```

</TabItem>
<TabItem value="python" label="Python">

```python
import requests

def generate_music():
    url = "https://api.kie.ai/api/v1/generate"
    headers = {
        "Authorization": "Bearer YOUR_API_KEY",
        "Content-Type": "application/json"
    }
    
    payload = {
        "prompt": "A calm and relaxing piano track with soft melodies",
        "customMode": False,
        "instrumental": True,
        "model": "V3_5",
        "callBackUrl": "https://your-app.com/callback"
    }
    
    try:
        response = requests.post(url, json=payload, headers=headers)
        result = response.json()
        
        if response.ok and result.get('code') == 200:
            print(f"Task submitted: {result}")
            print(f"Task ID: {result['data']['taskId']}")
            return result['data']['taskId']
        else:
            print(f"Request failed: {result.get('msg', 'Unknown error')}")
            return None
    except requests.exceptions.RequestException as e:
        print(f"Error: {e}")
        return None

generate_music()
```

</TabItem>
</Tabs>

### Step 2: Check Task Status

Use the returned task ID to check the generation status:

<Tabs>
<TabItem value="curl" label="cURL">

```bash
curl -X GET "https://api.kie.ai/api/v1/generate/record-info?taskId=YOUR_TASK_ID" \
  -H "Authorization: Bearer YOUR_API_KEY"
```

</TabItem>
<TabItem value="javascript" label="Node.js">

```javascript
async function checkTaskStatus(taskId) {
  try {
    const response = await fetch(`https://api.kie.ai/api/v1/generate/record-info?taskId=${taskId}`, {
      method: 'GET',
      headers: {
        'Authorization': 'Bearer YOUR_API_KEY'
      }
    });
    
    const result = await response.json();
    
    if (response.ok && result.code === 200) {
      const taskData = result.data;
      
      switch (taskData.status) {
        case 'SUCCESS':
          console.log('All tracks generated successfully!');
          console.log('Audio tracks:', taskData.response.sunoData);
          return taskData.response;
          
        case 'FIRST_SUCCESS':
          console.log('First track generation completed');
          if (taskData.response.sunoData && taskData.response.sunoData.length > 0) {
            console.log('Audio tracks:', taskData.response.sunoData);
          }
          return taskData.response;
          
        case 'TEXT_SUCCESS':
          console.log('Lyrics/text generation successful');
          return taskData.response;
          
        case 'PENDING':
          console.log('Task is pending...');
          return taskData.response;
          
        case 'CREATE_TASK_FAILED':
          console.log('Task creation failed');
          if (taskData.errorMessage) {
            console.error('Error message:', taskData.errorMessage);
          }
          return taskData.response;
          
        case 'GENERATE_AUDIO_FAILED':
          console.log('Audio generation failed');
          if (taskData.errorMessage) {
            console.error('Error message:', taskData.errorMessage);
          }
          return taskData.response;
          
        case 'CALLBACK_EXCEPTION':
          console.log('Callback process error');
          if (taskData.errorMessage) {
            console.error('Error message:', taskData.errorMessage);
          }
          return taskData.response;
          
        case 'SENSITIVE_WORD_ERROR':
          console.log('Content filtered due to sensitive words');
          if (taskData.errorMessage) {
            console.error('Error message:', taskData.errorMessage);
          }
          return taskData.response;
          
        default:
          console.log('Unknown status:', taskData.status);
          if (taskData.errorMessage) {
            console.error('Error message:', taskData.errorMessage);
          }
          return taskData.response;
      }
    } else {
      console.error('Query failed:', result.msg || 'Unknown error');
      return null;
    }
  } catch (error) {
    console.error('Status check failed:', error.message);
    return null;
  }
}
```

</TabItem>
<TabItem value="python" label="Python">

```python
import requests
import time

def check_task_status(task_id, api_key):
    url = f"https://api.kie.ai/api/v1/generate/record-info?taskId={task_id}"
    headers = {"Authorization": f"Bearer {api_key}"}
    
    try:
        response = requests.get(url, headers=headers)
        result = response.json()
        
        if response.ok and result.get('code') == 200:
            task_data = result['data']
            status = task_data['status']
            
            response_data = task_data['response']
            
            if status == 'SUCCESS':
                print("All tracks generated successfully!")
                for i, track in enumerate(response_data['sunoData']):
                    print(f"Track {i+1}: {track.get('audioUrl', 'Not completed')}")
                return response_data
            elif status == 'FIRST_SUCCESS':
                print("First track generation completed")
                if response_data.get('sunoData'):
                    for i, track in enumerate(response_data['sunoData']):
                        if track.get('audioUrl'):  # Only show completed tracks
                            print(f"Track {i+1}: {track['audioUrl']}")
                return response_data
            elif status == 'TEXT_SUCCESS':
                print("Lyrics/text generation successful")
                return response_data
            elif status == 'PENDING':
                print("Task is pending...")
                return response_data
            elif status == 'CREATE_TASK_FAILED':
                print("Task creation failed")
                if task_data.get('errorMessage'):
                    print(f"Error message: {task_data['errorMessage']}")
                return response_data
            elif status == 'GENERATE_AUDIO_FAILED':
                print("Audio generation failed")
                if task_data.get('errorMessage'):
                    print(f"Error message: {task_data['errorMessage']}")
                return response_data
            elif status == 'CALLBACK_EXCEPTION':
                print("Callback process error")
                if task_data.get('errorMessage'):
                    print(f"Error message: {task_data['errorMessage']}")
                return response_data
            elif status == 'SENSITIVE_WORD_ERROR':
                print("Content filtered due to sensitive words")
                if task_data.get('errorMessage'):
                    print(f"Error message: {task_data['errorMessage']}")
                return response_data
            else:
                print(f"Unknown status: {status}")
                if task_data.get('errorMessage'):
                    print(f"Error message: {task_data['errorMessage']}")
                return response_data
        else:
            print(f"Query failed: {result.get('msg', 'Unknown error')}")
            return None
    except requests.exceptions.RequestException as e:
        print(f"Status check failed: {e}")
        return None

# Poll until completion
def wait_for_completion(task_id, api_key):
    while True:
        result = check_task_status(task_id, api_key)
        if result is not None:
            return result
        time.sleep(30)  # Wait 30 seconds before checking again
```

</TabItem>
</Tabs>

### Response Format

**Successful Response:**

```json
{
  "code": 200,
  "msg": "success",
  "data": {
    "taskId": "5c79****be8e"
  }
}
```

**Task Status Response:**

```json
{
  "code": 200,
  "msg": "success",
  "data": {
    "taskId": "5c79****be8e",
    "status": "SUCCESS",
    "response": {
      "sunoData": [
        {
          "id": "e231****-****-****-****-****8cadc7dc",
          "audioUrl": "https://example.cn/****.mp3",
          "streamAudioUrl": "https://example.cn/****",
          "imageUrl": "https://example.cn/****.jpeg",
          "prompt": "A calm and relaxing piano track",
          "title": "Peaceful Piano",
          "tags": "calm, relaxing, piano",
          "duration": 198.44,
          "createTime": "2025-01-01 00:00:00"
        }
      ]
    }
  }
}
```

## Core Features

- **Text-to-Music**: Generate music from text descriptions with AI
- **Music Extension**: Seamlessly extend existing audio tracks
- **Lyrics Generation**: Create structured lyrical content from creative prompts
- **Audio Upload & Cover**: Upload audio files and transform them into different musical styles
- **Add Instrumental**: Generate instrumental accompaniment for uploaded audio files
- **Add Vocals**: Add vocal singing to uploaded audio files with custom styles
- **Vocal Separation**: Isolate vocals, instrumentals, and other audio components
- **Format Conversion**: Support for WAV and other high-quality audio formats
- **Music Videos**: Create visual content synchronized with your audio tracks
- **Audio Processing**: Comprehensive tools for audio enhancement and manipulation

## AI Models

Choose the right model for your needs:

<CardGroup cols={3}>
  <Card title="V3_5" icon="lucide-list-checks">
    **Better song structure**

    Max 4 minutes, improved song organization
  </Card>

  <Card title="V4" icon="lucide-wand-sparkles">
    **Improved vocals**

    Max 4 minutes, enhanced vocal quality
  </Card>

  <Card title="V4_5" icon="lucide-rocket">
    **Smart prompts**

    Max 8 minutes, faster generation
  </Card>

  <Card title="V4_5PLUS" icon="lucide-image">
    **Richer sound**

    Max 8 minutes, new creative ways
  </Card>

  <Card title="V4_5ALL" icon="lucide-bolt">
    **Smart and fast**

    Max 8 minutes, smarter prompts, faster generations
  </Card>

  <Card title="V5" icon="lucide-sparkles">
    **Faster generation**

    Max 8 minutes, superior musicality, improved speed
  </Card>
</CardGroup>

## Generation Modes

### Parameter Overview

| Parameter | Type | Required | Description |
| :--- | :--- | :--- | :--- |
| `customMode` | boolean | Yes | Controls parameter complexity: `false` (Simple Mode) or `true` (Advanced Mode) |
| `instrumental` | boolean | Yes | Determines vocal presence: `true` (Instrumental only) or `false` (Includes lyrics) |

---

## Key Parameters

| Parameter | Type | Required | Description |
| :--- | :--- | :--- | :--- |
| `prompt` | string | Yes | Text description used to generate music |
| `style` | string | No | Music style instructions (Custom Mode only) |
| `title` | string | No | Title for the generated music (Custom Mode only) |

---

### Prompt Character Limits

- **Non-Custom Mode**: 500 characters
- **Custom Mode (V3_5 & V4)**: 3,000 characters
- **Custom Mode (V4_5, V4_5PLUS & V5)**: 5,000 characters

### Style Character Limits

- **V3_5 & V4**: 200 characters
- **V4_5, V4_5PLUS & V5**: 1,000 characters

### Title Character Limit

- **Maximum Length**: 80 characters
## Complete Workflow Example

Here's a complete example that generates music with lyrics and waits for completion:

<Tabs>
<TabItem value="javascript" label="JavaScript">

```javascript
class SunoAPI {
  constructor(apiKey) {
    this.apiKey = apiKey;
    this.baseUrl = 'https://api.kie.ai/api/v1';
  }
  
  async generateMusic(prompt, options = {}) {
    const response = await fetch(`${this.baseUrl}/generate`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        prompt,
        customMode: options.customMode || false,
        instrumental: options.instrumental || false,
        model: options.model || 'V3_5',
        style: options.style,
        title: options.title,
        negativeTags: options.negativeTags,
        callBackUrl: options.callBackUrl || 'https://your-app.com/callback'
      })
    });
    
    const result = await response.json();
    if (!response.ok || result.code !== 200) {
      throw new Error(`Generation failed: ${result.msg || 'Unknown error'}`);
    }
    
    return result.data.taskId;
  }
  
  async extendMusic(audioId, options = {}) {
    const response = await fetch(`${this.baseUrl}/generate/extend`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        audioId,
        defaultParamFlag: options.defaultParamFlag || false,
        model: options.model || 'V3_5',
        prompt: options.prompt,
        style: options.style,
        title: options.title,
        continueAt: options.continueAt,
        callBackUrl: options.callBackUrl || 'https://your-app.com/callback'
      })
    });
    
    const result = await response.json();
    if (!response.ok || result.code !== 200) {
      throw new Error(`Extension failed: ${result.msg || 'Unknown error'}`);
    }
    
    return result.data.taskId;
  }
  
  async generateLyrics(prompt, callBackUrl) {
    const response = await fetch(`${this.baseUrl}/lyrics`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        prompt,
        callBackUrl
      })
    });
    
    const result = await response.json();
    if (!response.ok || result.code !== 200) {
      throw new Error(`Lyrics generation failed: ${result.msg || 'Unknown error'}`);
    }
    
    return result.data.taskId;
  }
  
  async waitForCompletion(taskId, maxWaitTime = 600000) { // 10 minutes max
    const startTime = Date.now();
    
    while (Date.now() - startTime < maxWaitTime) {
      const status = await this.getTaskStatus(taskId);
      
      switch (status.status) {
        case 'SUCCESS':
          console.log('All tracks generated successfully!');
          return status.response;
          
        case 'FIRST_SUCCESS':
          console.log('First track generation completed!');
          return status.response;
          
        case 'TEXT_SUCCESS':
          console.log('Lyrics/text generation successful!');
          return status.response;
          
        case 'PENDING':
          console.log('Task is pending...');
          break;
          
        case 'CREATE_TASK_FAILED':
          const createError = status.errorMessage || 'Task creation failed';
          console.error('Error message:', createError);
          throw new Error(createError);
          
        case 'GENERATE_AUDIO_FAILED':
          const audioError = status.errorMessage || 'Audio generation failed';
          console.error('Error message:', audioError);
          throw new Error(audioError);
          
        case 'CALLBACK_EXCEPTION':
          const callbackError = status.errorMessage || 'Callback process error';
          console.error('Error message:', callbackError);
          throw new Error(callbackError);
          
        case 'SENSITIVE_WORD_ERROR':
          const sensitiveError = status.errorMessage || 'Content filtered due to sensitive words';
          console.error('Error message:', sensitiveError);
          throw new Error(sensitiveError);
          
        default:
          console.log(`Unknown status: ${status.status}`);
          if (status.errorMessage) {
            console.error('Error message:', status.errorMessage);
          }
          break;
      }
      
      // Wait 10 seconds before next check
      await new Promise(resolve => setTimeout(resolve, 10000));
    }
    
    throw new Error('Generation timeout');
  }
  
  async getTaskStatus(taskId) {
    const response = await fetch(`${this.baseUrl}/generate/record-info?taskId=${taskId}`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${this.apiKey}`
      }
    });
    
    const result = await response.json();
    if (!response.ok || result.code !== 200) {
      throw new Error(`Status check failed: ${result.msg || 'Unknown error'}`);
    }
    
    return result.data;
  }
}

// Usage Example
async function main() {
  const api = new SunoAPI('YOUR_API_KEY');
  
  try {
    // Generate music with lyrics
    console.log('Starting music generation...');
    const taskId = await api.generateMusic(
      'A nostalgic folk song about childhood memories',
      { 
        customMode: true,
        instrumental: false,
        model: 'V4_5',
        style: 'Folk, Acoustic, Nostalgic',
        title: 'Childhood Dreams'
      }
    );
    
    // Wait for completion
    console.log(`Task ID: ${taskId}. Waiting for completion...`);
    const result = await api.waitForCompletion(taskId);
    
    console.log('Music generated successfully!');
    console.log('Generated tracks:');
    result.sunoData.forEach((track, index) => {
      console.log(`Track ${index + 1}:`);
      console.log(`  Title: ${track.title}`);
      console.log(`  Audio URL: ${track.audioUrl}`);
      console.log(`  Duration: ${track.duration}s`);
      console.log(`  Tags: ${track.tags}`);
    });
    
    // Extend the first track
    const firstTrack = result.sunoData[0];
    console.log('\nExtending the first track...');
    const extendTaskId = await api.extendMusic(firstTrack.id, {
      defaultParamFlag: true,
      prompt: 'Continue with a hopeful chorus',
      style: 'Folk, Uplifting',
      title: 'Childhood Dreams Extended',
      continueAt: 60,
      model: 'V4_5'
    });
    
    const extendResult = await api.waitForCompletion(extendTaskId);
    console.log('Music extended successfully!');
    console.log('Extended track URL:', extendResult.sunoData[0].audioUrl);
    
  } catch (error) {
    console.error('Error:', error.message);
  }
}

main();
```

</TabItem>
<TabItem value="python" label="Python">

```python
import requests
import time

class SunoAPI:
    def __init__(self, api_key):
        self.api_key = api_key
        self.base_url = 'https://api.kie.ai/api/v1'
        self.headers = {
            'Authorization': f'Bearer {api_key}',
            'Content-Type': 'application/json'
        }
    
    def generate_music(self, prompt, **options):
        data = {
            'prompt': prompt,
            'customMode': options.get('customMode', False),
            'instrumental': options.get('instrumental', False),
            'model': options.get('model', 'V3_5'),
            'callBackUrl': options.get('callBackUrl', 'https://your-app.com/callback')
        }
        
        if options.get('style'):
            data['style'] = options['style']
        if options.get('title'):
            data['title'] = options['title']
        if options.get('negativeTags'):
            data['negativeTags'] = options['negativeTags']
        
        response = requests.post(f'{self.base_url}/generate', 
                               headers=self.headers, json=data)
        result = response.json()
        
        if not response.ok or result.get('code') != 200:
            raise Exception(f"Generation failed: {result.get('msg', 'Unknown error')}")
        
        return result['data']['taskId']
    
    def extend_music(self, audio_id, **options):
        data = {
            'audioId': audio_id,
            'defaultParamFlag': options.get('defaultParamFlag', False),
            'model': options.get('model', 'V3_5'),
            'callBackUrl': options.get('callBackUrl', 'https://your-app.com/callback')
        }
        
        if options.get('prompt'):
            data['prompt'] = options['prompt']
        if options.get('style'):
            data['style'] = options['style']
        if options.get('title'):
            data['title'] = options['title']
        if options.get('continueAt'):
            data['continueAt'] = options['continueAt']
        
        response = requests.post(f'{self.base_url}/generate/extend', 
                               headers=self.headers, json=data)
        result = response.json()
        
        if not response.ok or result.get('code') != 200:
            raise Exception(f"Extension failed: {result.get('msg', 'Unknown error')}")
        
        return result['data']['taskId']
    
    def generate_lyrics(self, prompt, callback_url):
        data = {
            'prompt': prompt,
            'callBackUrl': callback_url
        }
        
        response = requests.post(f'{self.base_url}/lyrics', 
                               headers=self.headers, json=data)
        result = response.json()
        
        if not response.ok or result.get('code') != 200:
            raise Exception(f"Lyrics generation failed: {result.get('msg', 'Unknown error')}")
        
        return result['data']['taskId']
    
    def wait_for_completion(self, task_id, max_wait_time=600):
        start_time = time.time()
        
        while time.time() - start_time < max_wait_time:
            status = self.get_task_status(task_id)
            
            if status['status'] == 'SUCCESS':
                print("All tracks generated successfully!")
                return status['response']
            elif status['status'] == 'FIRST_SUCCESS':
                print("First track generation completed!")
                return status['response']
            elif status['status'] == 'TEXT_SUCCESS':
                print("Lyrics/text generation successful!")
                return status['response']
            elif status['status'] == 'PENDING':
                print("Task is pending...")
            elif status['status'] == 'CREATE_TASK_FAILED':
                error_msg = status.get('errorMessage', 'Task creation failed')
                print(f"Error message: {error_msg}")
                raise Exception(error_msg)
            elif status['status'] == 'GENERATE_AUDIO_FAILED':
                error_msg = status.get('errorMessage', 'Audio generation failed')
                print(f"Error message: {error_msg}")
                raise Exception(error_msg)
            elif status['status'] == 'CALLBACK_EXCEPTION':
                error_msg = status.get('errorMessage', 'Callback process error')
                print(f"Error message: {error_msg}")
                raise Exception(error_msg)
            elif status['status'] == 'SENSITIVE_WORD_ERROR':
                error_msg = status.get('errorMessage', 'Content filtered due to sensitive words')
                print(f"Error message: {error_msg}")
                raise Exception(error_msg)
            else:
                print(f"Unknown status: {status['status']}")
                if status.get('errorMessage'):
                    print(f"Error message: {status['errorMessage']}")
            
            time.sleep(10)  # Wait 10 seconds
        
        raise Exception('Generation timeout')
    
    def get_task_status(self, task_id):
        response = requests.get(f'{self.base_url}/generate/record-info?taskId={task_id}',
                              headers={'Authorization': f'Bearer {self.api_key}'})
        result = response.json()
        
        if not response.ok or result.get('code') != 200:
            raise Exception(f"Status check failed: {result.get('msg', 'Unknown error')}")
        
        return result['data']

# Usage Example
def main():
    api = SunoAPI('YOUR_API_KEY')
    
    try:
        # Generate music with lyrics
        print('Starting music generation...')
        task_id = api.generate_music(
            'A nostalgic folk song about childhood memories',
            customMode=True,
            instrumental=False,
            model='V4_5',
            style='Folk, Acoustic, Nostalgic',
            title='Childhood Dreams'
        )
        
        # Wait for completion
        print(f'Task ID: {task_id}. Waiting for completion...')
        result = api.wait_for_completion(task_id)
        
        print('Music generated successfully!')
        print('Generated tracks:')
        for i, track in enumerate(result['sunoData']):
            print(f"Track {i + 1}:")
            print(f"  Title: {track['title']}")
            print(f"  Audio URL: {track['audioUrl']}")
            print(f"  Duration: {track['duration']}s")
            print(f"  Tags: {track['tags']}")
        
        # Extend the first track
        first_track = result['sunoData'][0]
        print('\nExtending the first track...')
        extend_task_id = api.extend_music(
            first_track['id'],
            defaultParamFlag=True,
            prompt='Continue with a hopeful chorus',
            style='Folk, Uplifting',
            title='Childhood Dreams Extended',
            continueAt=60,
            model='V4_5'
        )
        
        extend_result = api.wait_for_completion(extend_task_id)
        print('Music extended successfully!')
        print(f"Extended track URL: {extend_result['sunoData'][0]['audioUrl']}")
        
    except Exception as error:
        print(f'Error: {error}')

if __name__ == '__main__':
    main()
```

</TabItem>
</Tabs>

## Advanced Features

### Boost Music Style (V4\_5 Models)

Enhance your style descriptions for better results:

```javascript
const response = await fetch('https://api.kie.ai/api/v1/style/generate', {
  method: 'POST',
  headers: {
    'Authorization': 'Bearer YOUR_API_KEY',
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    content: 'Pop, Mysterious'
  })
});

const result = await response.json();
console.log('Enhanced style:', result.data.result);
```

### Audio Processing Features

Convert, separate, and enhance your generated music:

<Tabs>
<TabItem value="wav" label="Convert to WAV">

```javascript
const response = await fetch('https://api.kie.ai/api/v1/wav/generate', {
  method: 'POST',
  headers: {
    'Authorization': 'Bearer YOUR_API_KEY',
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    taskId: 'YOUR_TASK_ID',
    audioId: 'YOUR_AUDIO_ID',
    callBackUrl: 'https://your-app.com/callback'
  })
});
```

</TabItem>
<TabItem value="vocals" label="Separate Vocals">

```javascript
const response = await fetch('https://api.kie.ai/api/v1/vocal-removal/generate', {
  method: 'POST',
  headers: {
    'Authorization': 'Bearer YOUR_API_KEY',
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    taskId: 'YOUR_TASK_ID',
    audioId: 'YOUR_AUDIO_ID',
    callBackUrl: 'https://your-app.com/callback'
  })
});
```

</TabItem>
<TabItem value="video" label="Create Music Video">

```javascript
const response = await fetch('https://api.kie.ai/api/v1/mp4/generate', {
  method: 'POST',
  headers: {
    'Authorization': 'Bearer YOUR_API_KEY',
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    taskId: 'YOUR_TASK_ID',
    audioId: 'YOUR_AUDIO_ID',
    author: 'Your Name',
    domainName: 'your-app.com',
    callBackUrl: 'https://your-app.com/callback'
  })
});
```

</TabItem>
</Tabs>

### Async Processing with Callbacks

Set up webhook callbacks for automatic notifications:

```javascript
const taskId = await api.generateMusic('Upbeat electronic dance music', {
  customMode: false,
  instrumental: true,
  model: 'V4_5',
  callBackUrl: 'https://your-server.com/suno-callback'
});

// Your callback endpoint will receive:
app.post('/suno-callback', (req, res) => {
  const { code, data } = req.body;
  
  if (code === 200 && data.callbackType === 'complete') {
    console.log('Music ready:', data.data);
    data.data.forEach(track => {
      console.log('Track:', track.audio_url);
    });
  }
  
  res.status(200).json({ status: 'received' });
});
```

<Card
  title="Learn More About Callbacks"
  icon="lucide-webhook"
  href="/suno-api/generate-music-callbacks"
>
  Complete guide to implementing and handling Suno API callbacks
</Card>


## Status Codes & Task States

| Status | Description |
|--------|-------------|
| `PENDING` | Task is waiting to be processed or currently generating |
| `TEXT_SUCCESS` | Lyrics/text generation completed successfully |
| `FIRST_SUCCESS` | First track generation completed |
| `SUCCESS` | All tracks generated successfully |
| `CREATE_TASK_FAILED` | Failed to create task |
| `GENERATE_AUDIO_FAILED` | Failed to generate audio |
| `SENSITIVE_WORD_ERROR` | Content filtered due to sensitive words |

## Best Practices

<AccordionGroup>
<Accordion title="Prompt Engineering">

- Be specific about genre, mood, and instruments
- Use descriptive adjectives for better style control
- Include tempo and energy level descriptions
- Reference musical eras or specific artists for style guidance

</Accordion>
<Accordion title="Model Selection">

- V3_5: Best for structured songs with clear verse/chorus patterns
- V4: Choose when vocal quality is most important
- V4_5: Use for faster generation and smart prompt handling
- V4_5PLUS: Select for the highest quality and longest tracks
- V5: Faster generation with superior musicality and improved speed

</Accordion>
<Accordion title="Performance Optimization">

- Use callbacks instead of frequent polling
- Start with non-custom mode for simpler requirements
- Implement proper error handling for failed generations
- Cache generated content since files expire after 14 days

</Accordion>
<Accordion title="Content Guidelines">

- Avoid copyrighted material in prompts
- Use original lyrics and musical descriptions
- Be mindful of content policies for lyrical content
- Test prompt variations to avoid sensitive word filters

</Accordion>
</AccordionGroup>

## Error Handling

<AccordionGroup>
<Accordion title="Content Policy Violations (Code 400)">

```javascript
try {
  const taskId = await api.generateMusic('copyrighted song lyrics');
} catch (error) {
  if (error.data.code === 400) {
    console.log('Please use original content only');
  }
}
```

</Accordion>
<Accordion title="Insufficient Credits (Code 402)">

```javascript
try {
  const taskId = await api.generateMusic('original composition');
} catch (error) {
  if (error.data.code === 402) {
    console.log('Please add more credits to your account');
  }
}
```

</Accordion>
<Accordion title="Rate Limiting (Code 429)">

```javascript
const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

async function generateWithRetry(prompt, options, maxRetries = 3) {
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await api.generateMusic(prompt, options);
    } catch (error) {
      if (error.data.code === 429 && i < maxRetries - 1) {
        await delay(Math.pow(2, i) * 1000); // Exponential backoff
        continue;
      }
      throw error;
    }
  }
}
```

</Accordion>
</AccordionGroup>

## Support

:::note[Our technical support team is here to assist you.]

 - **Email**: [support@kie.ai](mailto:support@kie.ai)
 - **Documentation**: [docs.kie.ai](https://docs.kie.ai)
 - **API Status**: Check our status page for real-time API health

:::

---

Ready to start creating amazing AI music? [Get your API key](https://kie.ai/api-key) and begin composing today!


# ========== generate-music-callbacks ==========

# Music Generation Callbacks

System will call this callback when audio generation is complete.

When you submit a music generation task to the Suno API, you can use the `callBackUrl` parameter to set a callback URL. The system will automatically push the results to your specified address when the task is completed.

## Callback Mechanism Overview

:::info[]
The callback mechanism eliminates the need to poll the API for task status. The system will proactively push task completion results to your server.
:::

:::tip Webhook Security
To ensure the authenticity and integrity of callback requests, we strongly recommend implementing webhook signature verification. See our [Webhook Verification Guide](/common-api/webhook-verification) for detailed implementation steps.
:::

### Callback Timing

The system will send callback notifications in the following situations:
- Music generation task completed successfully
- Music generation task failed
- Errors occurred during task processing

### Callback Method

- **HTTP Method**: POST
- **Content Type**: application/json
- **Timeout Setting**: 15 seconds

## Callback Request Format

When the task is completed, the system will send a POST request to your `callBackUrl` in the following format:

<Tabs>
  <TabItem value="success" label="Success Callback">
    ```json
    {
      "code": 200,
      "msg": "All generated successfully.",
      "data": {
        "callbackType": "complete",
        "task_id": "2fac****9f72",
        "data": [
          {
            "id": "e231****-****-****-****-****8cadc7dc",
            "audio_url": "https://example.cn/****.mp3",
            "stream_audio_url": "https://example.cn/****",
            "image_url": "https://example.cn/****.jpeg",
            "prompt": "[Verse] Night city lights shining bright",
            "model_name": "chirp-v3-5",
            "title": "Iron Man",
            "tags": "electrifying, rock",
            "createTime": "2025-01-01 00:00:00",
            "duration": 198.44
          },
          {
            "id": "e231****-****-****-****-****8cadc7dc",
            "audio_url": "https://example.cn/****.mp3",
            "stream_audio_url": "https://example.cn/****",
            "image_url": "https://example.cn/****.jpeg",
            "prompt": "[Verse] Night city lights shining bright",
            "model_name": "chirp-v3-5",
            "title": "Iron Man",
            "tags": "electrifying, rock",
            "createTime": "2025-01-01 00:00:00",
            "duration": 228.28
          }
        ]
      }
    }
    ```
  </TabItem>
  <TabItem value="failure" label="Failure Callback">
    ```json
    {
      "code": 501,
      "msg": "Audio generation failed",
      "data": {
        "callbackType": "error",
        "task_id": "2fac****9f72",
        "data": null
      }
    }
    ```
  </TabItem>
</Tabs>

## Status Code Description

### code (integer, required)

Callback status code indicating task processing result:

| Status Code | Description |
|-------------|-------------|
| 200 | Success - Request has been processed successfully |
| 400 | Validation Error - Lyrics contained copyrighted material |
| 408 | Rate Limited - Timeout |
| 413 | Conflict - Uploaded audio matches existing work of art |
| 500 | Server Error - An unexpected error occurred while processing the request |
| 501 | Audio generation failed |
| 531 | Server Error - Sorry, the generation failed due to an issue. Your credits have been refunded. Please try again |

### msg (string, required)

Status message providing detailed status description

### data.callbackType (string, required)

Callback type:
- **text** - Text generation complete
- **first** - First track complete
- **complete** - All tracks complete
- **error** - Generation failed

### data.task_id (string, required)

Task ID, consistent with the task_id returned when you submitted the task

### data.data (array)

Generated audio data array, returned on success

### data.data[].id (string)

Audio unique identifier (audioId)

### data.data[].audio_url (string)

Audio file URL

### data.data[].stream_audio_url (string)

Streaming audio URL

### data.data[].image_url (string)

Cover image URL

### data.data[].prompt (string)

Generation prompt/lyrics

### data.data[].model_name (string)

Model name used

### data.data[].title (string)

Music title

### data.data[].tags (string)

Music tags

### data.data[].createTime (string)

Creation time

### data.data[].duration (number)

Audio duration (seconds)

## Callback Reception Examples

Here are example codes for receiving callbacks in popular programming languages:

<Tabs>
  <TabItem value="nodejs" label="Node.js">
    ```javascript
    const express = require('express');
    const app = express();

    app.use(express.json());

    app.post('/suno-callback', (req, res) => {
      const { code, msg, data } = req.body;
      
      console.log('Received callback:', {
        taskId: data.task_id,
        status: code,
        message: msg,
        callbackType: data.callbackType
      });
      
      if (code === 200) {
        // Task completed successfully
        if (data.callbackType === 'complete') {
          console.log('Music generation completed:', data.data);
          
          // Process generated music data
          data.data.forEach(audio => {
            console.log(`Audio ID: ${audio.id}`);
            console.log(`Audio URL: ${audio.audio_url}`);
            console.log(`Title: ${audio.title}`);
            console.log(`Duration: ${audio.duration} seconds`);
          });
          
        } else if (data.callbackType === 'first') {
          console.log('First track completed');
          
        } else if (data.callbackType === 'text') {
          console.log('Text generation completed');
        }
        
      } else {
        // Task failed
        console.log('Task failed:', msg);
        
        // Handle failure cases...
      }
      
      // Return 200 status code to confirm callback received
      res.status(200).json({ status: 'received' });
    });

    app.listen(3000, () => {
      console.log('Callback server running on port 3000');
    });
    ```
  </TabItem>

  <TabItem value="python" label="Python">
    ```python
    from flask import Flask, request, jsonify
    import json

    app = Flask(__name__)

    @app.route('/suno-callback', methods=['POST'])
    def handle_callback():
        data = request.json
        
        code = data.get('code')
        msg = data.get('msg')
        callback_data = data.get('data', {})
        task_id = callback_data.get('task_id')
        callback_type = callback_data.get('callbackType')
        
        print(f"Received callback: {task_id}, status: {code}, type: {callback_type}, message: {msg}")
        
        if code == 200:
            # Task completed successfully
            if callback_type == 'complete':
                audio_list = callback_data.get('data', [])
                print(f"Music generation completed, generated {len(audio_list)} tracks")
                
                for audio in audio_list:
                    print(f"Audio ID: {audio['id']}")
                    print(f"Audio URL: {audio['audio_url']}")
                    print(f"Title: {audio['title']}")
                    print(f"Duration: {audio['duration']} seconds")
                    
            elif callback_type == 'first':
                print("First track completed")
                
            elif callback_type == 'text':
                print("Text generation completed")
                
        else:
            # Task failed
            print(f"Task failed: {msg}")
            
            # Handle failure cases...
        
        # Return 200 status code to confirm callback received
        return jsonify({'status': 'received'}), 200

    if __name__ == '__main__':
        app.run(host='0.0.0.0', port=3000)
    ```
  </TabItem>

  <TabItem value="php" label="PHP">
    ```php
    <?php
    header('Content-Type: application/json');

    // Get POST data
    $input = file_get_contents('php://input');
    $data = json_decode($input, true);

    $code = $data['code'] ?? null;
    $msg = $data['msg'] ?? '';
    $callbackData = $data['data'] ?? [];
    $taskId = $callbackData['task_id'] ?? '';
    $callbackType = $callbackData['callbackType'] ?? '';

    error_log("Received callback: $taskId, status: $code, type: $callbackType, message: $msg");

    if ($code === 200) {
        // Task completed successfully
        if ($callbackType === 'complete') {
            $audioList = $callbackData['data'] ?? [];
            error_log("Music generation completed, generated " . count($audioList) . " tracks");
            
            foreach ($audioList as $audio) {
                error_log("Audio ID: " . $audio['id']);
                error_log("Audio URL: " . $audio['audio_url']);
                error_log("Title: " . $audio['title']);
                error_log("Duration: " . $audio['duration'] . " seconds");
            }
            
        } elseif ($callbackType === 'first') {
            error_log("First track completed");
            
        } elseif ($callbackType === 'text') {
            error_log("Text generation completed");
        }
        
    } else {
        // Task failed
        error_log("Task failed: $msg");
        
        // Handle failure cases...
    }

    // Return 200 status code to confirm callback received
    http_response_code(200);
    echo json_encode(['status' => 'received']);
    ?>
    ```
  </TabItem>
</Tabs>

## Best Practices

:::tip Callback URL Configuration Recommendations
1. **Use HTTPS**: Ensure your callback URL uses HTTPS protocol for secure data transmission
2. **Verify Source**: Verify the legitimacy of the request source in callback processing
3. **Idempotent Processing**: The same task_id may receive multiple callbacks, ensure processing logic is idempotent
4. **Quick Response**: Callback processing should return a 200 status code as quickly as possible to avoid timeout
5. **Asynchronous Processing**: Complex business logic should be processed asynchronously to avoid blocking callback response
6. **Stage Tracking**: Differentiate between different generation stages based on callbackType and arrange business logic appropriately
:::

:::warning Important Reminders
- Callback URL must be a publicly accessible address
- Server must respond within 15 seconds, otherwise it will be considered a timeout
- If 3 consecutive retries fail, the system will stop sending callbacks
- Please ensure the stability of callback processing logic to avoid callback failures due to exceptions
- Pay attention to handling different callbackType callbacks, especially the complete type for final results
:::

## Troubleshooting

If you do not receive callback notifications, please check the following:

<details>
  <summary>Network Connection Issues</summary>

- Confirm that the callback URL is accessible from the public network
- Check firewall settings to ensure inbound requests are not blocked
- Verify that domain name resolution is correct
</details>

<details>
  <summary>Server Response Issues</summary>

- Ensure the server returns HTTP 200 status code within 15 seconds
- Check server logs for error messages
- Verify that the interface path and HTTP method are correct
</details>

<details>
  <summary>Content Format Issues</summary>

- Confirm that the received POST request body is in JSON format
- Check that Content-Type is application/json
- Verify that JSON parsing is correct
</details>

<details>
  <summary>Callback Type Processing</summary>

- Confirm proper handling of different callbackTypes
- Check if processing of complete type final results is missed
- Verify that audio data parsing is correct
</details>

## Alternative Solution

If you cannot use the callback mechanism, you can also use polling:

<Card
  title="Poll Query Results"
  icon="lucide-radar"
  href="/suno-api/get-music-details"
>
  Use the get music details endpoint to regularly query task status. We recommend querying every 30 seconds.
</Card>



# ========== extend-music-callbacks ==========

# Music Extension Callbacks

System will call this callback when audio generation is complete

When you submit a music extension task to the Suno API, you can use the `callBackUrl` parameter to set a callback URL. The system will automatically push the results to your specified address when the task is completed.

## Callback Mechanism Overview

:::info[]
The callback mechanism eliminates the need to poll the API for task status. The system will proactively push task completion results to your server.
:::

:::tip Webhook Security
To ensure the authenticity and integrity of callback requests, we strongly recommend implementing webhook signature verification. See our [Webhook Verification Guide](/common-api/webhook-verification) for detailed implementation steps.
:::

### Callback Timing

The system will send callback notifications in the following situations:
- Text generation completed (callbackType: "text")
- First audio track generation completed (callbackType: "first")
- All audio tracks generation completed (callbackType: "complete")
- Audio generation task failed
- Errors occurred during task processing

### Callback Method

- **HTTP Method**: POST
- **Content Type**: application/json
- **Timeout Setting**: 15 seconds

## Callback Request Format

When the task progresses or completes, the system will send a POST request to your `callBackUrl` in the following format:

<Tabs>
  <TabItem value="complete" label="Complete Success Callback">
    ```json
    {
      "code": 200,
      "msg": "All generated successfully.",
      "data": {
        "callbackType": "complete",
        "task_id": "2fac****9f72",
        "data": [
          {
            "id": "e231****-****-****-****-****8cadc7dc",
            "audio_url": "https://example.cn/****.mp3",
            "stream_audio_url": "https://example.cn/****",
            "image_url": "https://example.cn/****.jpeg",
            "prompt": "[Verse] Night city lights shining bright",
            "model_name": "chirp-v3-5",
            "title": "Iron Man",
            "tags": "electrifying, rock",
            "createTime": "2025-01-01 00:00:00",
            "duration": 198.44
          },
          {
            "id": "e231****-****-****-****-****8cadc7dc",
            "audio_url": "https://example.cn/****.mp3",
            "stream_audio_url": "https://example.cn/****",
            "image_url": "https://example.cn/****.jpeg",
            "prompt": "[Verse] Night city lights shining bright",
            "model_name": "chirp-v3-5",
            "title": "Iron Man",
            "tags": "electrifying, rock",
            "createTime": "2025-01-01 00:00:00",
            "duration": 228.28
          }
        ]
      }
    }
    ```
  </TabItem>
  <TabItem value="first" label="First Track Complete Callback">
    ```json
    {
      "code": 200,
      "msg": "First track generated successfully.",
      "data": {
        "callbackType": "first",
        "task_id": "2fac****9f72",
        "data": [
          {
            "id": "e231****-****-****-****-****8cadc7dc",
            "audio_url": "https://example.cn/****.mp3",
            "stream_audio_url": "https://example.cn/****",
            "image_url": "https://example.cn/****.jpeg",
            "prompt": "[Verse] Night city lights shining bright",
            "model_name": "chirp-v3-5",
            "title": "Iron Man",
            "tags": "electrifying, rock",
            "createTime": "2025-01-01 00:00:00",
            "duration": 198.44
          }
        ]
      }
    }
    ```
  </TabItem>
  <TabItem value="text" label="Text Generation Complete Callback">
    ```json
    {
      "code": 200,
      "msg": "Text generation completed.",
      "data": {
        "callbackType": "text",
        "task_id": "2fac****9f72",
        "data": []
      }
    }
    ```
  </TabItem>
  <TabItem value="failure" label="Failure Callback">
    ```json
    {
      "code": 501,
      "msg": "Audio generation failed.",
      "data": {
        "callbackType": "error",
        "task_id": "2fac****9f72",
        "data": []
      }
    }
    ```
  </TabItem>
</Tabs>

## Status Code Description

### code (integer, required)

Callback status code indicating task processing result:

| Status Code | Description |
|-------------|-------------|
| 200 | Success - Request has been processed successfully |
| 400 | Validation Error - Lyrics contained copyrighted material |
| 408 | Rate Limited - Timeout |
| 413 | Conflict - Uploaded audio matches existing work of art |
| 500 | Server Error - An unexpected error occurred while processing the request |
| 501 | Audio generation failed |
| 531 | Server Error - Sorry, the generation failed due to an issue. Your credits have been refunded. Please try again |

### msg (string, required)

Status message providing detailed status description

### data.callbackType (string, required)

Callback type indicating the stage of generation:
- **text**: Text generation complete
- **first**: First track complete
- **complete**: All tracks complete
- **error**: Generation failed

### data.task_id (string, required)

Task ID, consistent with the taskId returned when you submitted the task

### data.data (array, required)

Array of generated audio tracks. Empty for text callbacks or failures.

### data.data[].id (string)

Audio unique identifier (audioId)

### data.data[].audio_url (string)

Audio file URL for download

### data.data[].stream_audio_url (string)

Streaming audio URL for real-time playback

### data.data[].image_url (string)

Cover image URL

### data.data[].prompt (string)

Generation prompt/lyrics used

### data.data[].model_name (string)

Model name used for generation (e.g., "chirp-v3-5")

### data.data[].title (string)

Music title

### data.data[].tags (string)

Music tags/genre

### data.data[].createTime (string)

Creation timestamp

### data.data[].duration (number)

Audio duration in seconds

## Callback Reception Examples

Here are example codes for receiving callbacks in popular programming languages:

<Tabs>
  <TabItem value="nodejs" label="Node.js">
    ```javascript
    const express = require('express');
    const fs = require('fs');
    const https = require('https');
    const app = express();

    app.use(express.json());

    app.post('/suno-extend-callback', (req, res) => {
      const { code, msg, data } = req.body;
      
      console.log('Received Suno music extension callback:', {
        taskId: data.task_id,
        callbackType: data.callbackType,
        status: code,
        message: msg
      });
      
      if (code === 200) {
        // Task progressed or completed successfully
        const { callbackType, task_id, data: tracks } = data;
        
        console.log(`Callback type: ${callbackType}`);
        console.log(`Number of tracks: ${tracks.length}`);
        
        switch (callbackType) {
          case 'text':
            console.log('Text generation completed, waiting for audio...');
            break;
            
          case 'first':
            console.log('First track completed, processing remaining tracks...');
            downloadTracks(tracks, task_id);
            break;
            
          case 'complete':
            console.log('All tracks completed successfully!');
            downloadTracks(tracks, task_id);
            break;
        }
        
      } else {
        // Task failed
        console.log('Suno music extension failed:', msg);
        
        // Handle specific error types
        if (code === 400) {
          console.log('Validation error - check for copyrighted content');
        } else if (code === 408) {
          console.log('Rate limited - please wait before retrying');
        } else if (code === 413) {
          console.log('Content conflict - audio matches existing work');
        } else if (code === 501) {
          console.log('Generation failed - may need to adjust parameters');
        } else if (code === 531) {
          console.log('Server error with credit refund - safe to retry');
        }
      }
      
      // Return 200 status code to confirm callback received
      res.status(200).json({ status: 'received' });
    });

    // Function to download tracks
    function downloadTracks(tracks, taskId) {
      tracks.forEach((track, index) => {
        const { id, audio_url, image_url, title, duration } = track;
        
        console.log(`Track ${index + 1}: ${title} (${duration}s)`);
        
        // Download audio file
        if (audio_url) {
          downloadFile(audio_url, `suno_extend_${taskId}_${id}.mp3`)
            .then(() => console.log(`Audio downloaded: ${id}`))
            .catch(err => console.error(`Audio download failed for ${id}:`, err));
        }
        
        // Download cover image
        if (image_url) {
          downloadFile(image_url, `suno_cover_${taskId}_${id}.jpeg`)
            .then(() => console.log(`Cover downloaded: ${id}`))
            .catch(err => console.error(`Cover download failed for ${id}:`, err));
        }
      });
    }

    // Helper function to download files
    function downloadFile(url, filename) {
      return new Promise((resolve, reject) => {
        const file = fs.createWriteStream(filename);
        
        https.get(url, (response) => {
          if (response.statusCode === 200) {
            response.pipe(file);
            file.on('finish', () => {
              file.close();
              resolve();
            });
          } else {
            reject(new Error(`HTTP ${response.statusCode}`));
          }
        }).on('error', reject);
      });
    }

    app.listen(3000, () => {
      console.log('Callback server running on port 3000');
    });
    ```
  </TabItem>

  <TabItem value="python" label="Python">
    ```python
    from flask import Flask, request, jsonify
    import requests
    import os

    app = Flask(__name__)

    @app.route('/suno-extend-callback', methods=['POST'])
    def handle_callback():
        data = request.json
        
        code = data.get('code')
        msg = data.get('msg')
        callback_data = data.get('data', {})
        callback_type = callback_data.get('callbackType')
        task_id = callback_data.get('task_id')
        tracks = callback_data.get('data', [])
        
        print(f"Received Suno music extension callback:")
        print(f"Task ID: {task_id}, Type: {callback_type}")
        print(f"Status: {code}, Message: {msg}")
        
        if code == 200:
            # Task progressed or completed successfully
            print(f"Callback type: {callback_type}")
            print(f"Number of tracks: {len(tracks)}")
            
            if callback_type == 'text':
                print("Text generation completed, waiting for audio...")
            elif callback_type == 'first':
                print("First track completed, processing remaining tracks...")
                download_tracks(tracks, task_id)
            elif callback_type == 'complete':
                print("All tracks completed successfully!")
                download_tracks(tracks, task_id)
                
        else:
            # Task failed
            print(f"Suno music extension failed: {msg}")
            
            # Handle specific error types
            if code == 400:
                print("Validation error - check for copyrighted content")
            elif code == 408:
                print("Rate limited - please wait before retrying")
            elif code == 413:
                print("Content conflict - audio matches existing work")
            elif code == 501:
                print("Generation failed - may need to adjust parameters")
            elif code == 531:
                print("Server error with credit refund - safe to retry")
        
        # Return 200 status code to confirm callback received
        return jsonify({'status': 'received'}), 200

    def download_tracks(tracks, task_id):
        """Download audio tracks and cover images"""
        for i, track in enumerate(tracks):
            track_id = track.get('id')
            audio_url = track.get('audio_url')
            image_url = track.get('image_url')
            title = track.get('title')
            duration = track.get('duration')
            
            print(f"Track {i + 1}: {title} ({duration}s)")
            
            # Download audio file
            if audio_url:
                try:
                    audio_filename = f"suno_extend_{task_id}_{track_id}.mp3"
                    download_file(audio_url, audio_filename)
                    print(f"Audio downloaded: {track_id}")
                except Exception as e:
                    print(f"Audio download failed for {track_id}: {e}")
            
            # Download cover image
            if image_url:
                try:
                    image_filename = f"suno_cover_{task_id}_{track_id}.jpeg"
                    download_file(image_url, image_filename)
                    print(f"Cover downloaded: {track_id}")
                except Exception as e:
                    print(f"Cover download failed for {track_id}: {e}")

    def download_file(url, filename):
        """Download file from URL and save locally"""
        response = requests.get(url, stream=True)
        response.raise_for_status()
        
        os.makedirs('downloads', exist_ok=True)
        filepath = os.path.join('downloads', filename)
        
        with open(filepath, 'wb') as f:
            for chunk in response.iter_content(chunk_size=8192):
                f.write(chunk)

    if __name__ == '__main__':
        app.run(host='0.0.0.0', port=3000)
    ```
  </TabItem>

  <TabItem value="php" label="PHP">
    ```php
    <?php
    header('Content-Type: application/json');

    // Get POST data
    $input = file_get_contents('php://input');
    $data = json_decode($input, true);

    $code = $data['code'] ?? null;
    $msg = $data['msg'] ?? '';
    $callbackData = $data['data'] ?? [];
    $callbackType = $callbackData['callbackType'] ?? '';
    $taskId = $callbackData['task_id'] ?? '';
    $tracks = $callbackData['data'] ?? [];

    error_log("Received Suno music extension callback:");
    error_log("Task ID: $taskId, Type: $callbackType");
    error_log("Status: $code, Message: $msg");

    if ($code === 200) {
        // Task progressed or completed successfully
        error_log("Callback type: $callbackType");
        error_log("Number of tracks: " . count($tracks));
        
        switch ($callbackType) {
            case 'text':
                error_log("Text generation completed, waiting for audio...");
                break;
                
            case 'first':
                error_log("First track completed, processing remaining tracks...");
                downloadTracks($tracks, $taskId);
                break;
                
            case 'complete':
                error_log("All tracks completed successfully!");
                downloadTracks($tracks, $taskId);
                break;
        }
        
    } else {
        // Task failed
        error_log("Suno music extension failed: $msg");
        
        // Handle specific error types
        if ($code === 400) {
            error_log("Validation error - check for copyrighted content");
        } elseif ($code === 408) {
            error_log("Rate limited - please wait before retrying");
        } elseif ($code === 413) {
            error_log("Content conflict - audio matches existing work");
        } elseif ($code === 501) {
            error_log("Generation failed - may need to adjust parameters");
        } elseif ($code === 531) {
            error_log("Server error with credit refund - safe to retry");
        }
    }

    // Return 200 status code to confirm callback received
    http_response_code(200);
    echo json_encode(['status' => 'received']);

    function downloadTracks($tracks, $taskId) {
        foreach ($tracks as $i => $track) {
            $trackId = $track['id'] ?? '';
            $audioUrl = $track['audio_url'] ?? '';
            $imageUrl = $track['image_url'] ?? '';
            $title = $track['title'] ?? '';
            $duration = $track['duration'] ?? 0;
            
            error_log("Track " . ($i + 1) . ": $title ({$duration}s)");
            
            // Download audio file
            if (!empty($audioUrl)) {
                try {
                    $audioFilename = "suno_extend_{$taskId}_{$trackId}.mp3";
                    downloadFile($audioUrl, $audioFilename);
                    error_log("Audio downloaded: $trackId");
                } catch (Exception $e) {
                    error_log("Audio download failed for $trackId: " . $e->getMessage());
                }
            }
            
            // Download cover image
            if (!empty($imageUrl)) {
                try {
                    $imageFilename = "suno_cover_{$taskId}_{$trackId}.jpeg";
                    downloadFile($imageUrl, $imageFilename);
                    error_log("Cover downloaded: $trackId");
                } catch (Exception $e) {
                    error_log("Cover download failed for $trackId: " . $e->getMessage());
                }
            }
        }
    }

    function downloadFile($url, $filename) {
        $downloadDir = 'downloads';
        if (!is_dir($downloadDir)) {
            mkdir($downloadDir, 0755, true);
        }
        
        $filepath = $downloadDir . '/' . $filename;
        
        $fileContent = file_get_contents($url);
        if ($fileContent === false) {
            throw new Exception("Failed to download file from URL");
        }
        
        $result = file_put_contents($filepath, $fileContent);
        if ($result === false) {
            throw new Exception("Failed to save file locally");
        }
    }
    ?>
    ```
  </TabItem>
</Tabs>

## Best Practices

:::tip Callback URL Configuration Recommendations
1. **Use HTTPS**: Ensure your callback URL uses HTTPS protocol for secure data transmission
2. **Verify Source**: Verify the legitimacy of the request source in callback processing
3. **Idempotent Processing**: The same task_id may receive multiple callbacks, ensure processing logic is idempotent
4. **Quick Response**: Callback processing should return a 200 status code as quickly as possible to avoid timeout
5. **Asynchronous Processing**: Complex business logic should be processed asynchronously to avoid blocking callback response
6. **Handle Multiple Callbacks**: Be prepared to receive text, first, and complete callbacks for the same task
:::

:::warning Important Reminders
- Callback URL must be a publicly accessible address
- Server must respond within 15 seconds, otherwise it will be considered a timeout
- If 3 consecutive retries fail, the system will stop sending callbacks
- You may receive multiple callbacks for the same task (text → first → complete)
- Please ensure the stability of callback processing logic to avoid callback failures due to exceptions
- Handle copyright and conflict errors appropriately (codes 400, 413)
- Credit refunds are automatic for certain server errors (code 531)
:::

## Troubleshooting

If you do not receive callback notifications, please check the following:

<details>
  <summary>Network Connection Issues</summary>

- Confirm that the callback URL is accessible from the public network
- Check firewall settings to ensure inbound requests are not blocked
- Verify that domain name resolution is correct
</details>

<details>
  <summary>Server Response Issues</summary>

- Ensure the server returns HTTP 200 status code within 15 seconds
- Check server logs for error messages
- Verify that the interface path and HTTP method are correct
</details>

<details>
  <summary>Content Format Issues</summary>

- Confirm that the received POST request body is in JSON format
- Check that Content-Type is application/json
- Verify that JSON parsing is correct
</details>

<details>
  <summary>Audio Processing Issues</summary>

- Confirm that audio URLs are accessible
- Check audio download permissions and network connections
- Verify audio save paths and permissions
- Handle both regular and streaming audio URLs appropriately
- Process multiple tracks in the same callback
</details>

<details>
  <summary>Copyright and Content Issues</summary>

- Review error messages for copyright violations (code 400)
- Check for content conflicts with existing works (code 413)
- Ensure compliance with platform content policies
- Adjust lyrics or prompts if flagged
</details>

<details>
  <summary>Rate Limiting Issues</summary>

- Handle timeout errors gracefully (code 408)
- Implement appropriate retry logic with backoff
- Monitor API usage to avoid rate limits
- Consider upgrading service plan if needed
</details>

## Alternative Solution

If you cannot use the callback mechanism, you can also use polling:

<Card
  title="Poll Query Results"
  icon="lucide-radar"
  href="/suno-api/get-music-details"
>
  Use the get music details endpoint to regularly query task status. We recommend querying every 30 seconds.
</Card>



# ========== upload-and-cover-audio-callbacks ==========

# Audio Upload and Cover Callbacks

System will call this callback when audio generation is complete.

When you submit an audio upload and cover task to the Suno API, you can use the `callBackUrl` parameter to set a callback URL. The system will automatically push the results to your specified address when the task is completed.

## Callback Mechanism Overview

:::info[]
The callback mechanism eliminates the need to poll the API for task status. The system will proactively push task completion results to your server.
:::

:::tip Webhook Security
To ensure the authenticity and integrity of callback requests, we strongly recommend implementing webhook signature verification. See our [Webhook Verification Guide](/common-api/webhook-verification) for detailed implementation steps.
:::

### Callback Timing

The system will send callback notifications in the following situations:
- Text generation completed (callbackType: "text")
- First audio track generation completed (callbackType: "first")
- All audio tracks generation completed (callbackType: "complete")
- Audio generation task failed
- Errors occurred during task processing

### Callback Method

- **HTTP Method**: POST
- **Content Type**: application/json
- **Timeout Setting**: 15 seconds

## Callback Request Format

When the task progresses or completes, the system will send a POST request to your `callBackUrl` in the following format:

<Tabs>
  <TabItem value="complete" label="Complete Success Callback">
    ```json
    {
      "code": 200,
      "msg": "All generated successfully.",
      "data": {
        "callbackType": "complete",
        "task_id": "2fac****9f72",
        "data": [
          {
            "id": "e231****-****-****-****-****8cadc7dc",
            "audio_url": "https://example.cn/****.mp3",
            "source_audio_url": "https://example.cn/****.mp3",
            "stream_audio_url": "https://example.cn/****",
            "source_stream_audio_url": "https://example.cn/****",
            "image_url": "https://example.cn/****.jpeg",
            "source_image_url": "https://example.cn/****.jpeg",
            "prompt": "[Verse] Night city lights shining bright",
            "model_name": "chirp-v3-5",
            "title": "Iron Man",
            "tags": "electrifying, rock",
            "createTime": "2025-01-01 00:00:00",
            "duration": 198.44
          },
          {
            "id": "e231****-****-****-****-****8cadc7dc",
            "audio_url": "https://example.cn/****.mp3",
            "source_audio_url": "https://example.cn/****.mp3",
            "stream_audio_url": "https://example.cn/****",
            "source_stream_audio_url": "https://example.cn/****",
            "image_url": "https://example.cn/****.jpeg",
            "source_image_url": "https://example.cn/****.jpeg",
            "prompt": "[Verse] Night city lights shining bright",
            "model_name": "chirp-v3-5",
            "title": "Iron Man",
            "tags": "electrifying, rock",
            "createTime": "2025-01-01 00:00:00",
            "duration": 228.28
          }
        ]
      }
    }
    ```
  </TabItem>
  <TabItem value="first" label="First Track Complete Callback">
    ```json
    {
      "code": 200,
      "msg": "First track generated successfully.",
      "data": {
        "callbackType": "first",
        "task_id": "2fac****9f72",
        "data": [
          {
            "id": "e231****-****-****-****-****8cadc7dc",
            "audio_url": "https://example.cn/****.mp3",
            "source_audio_url": "https://example.cn/****.mp3",
            "stream_audio_url": "https://example.cn/****",
            "source_stream_audio_url": "https://example.cn/****",
            "image_url": "https://example.cn/****.jpeg",
            "source_image_url": "https://example.cn/****.jpeg",
            "prompt": "[Verse] Night city lights shining bright",
            "model_name": "chirp-v3-5",
            "title": "Iron Man",
            "tags": "electrifying, rock",
            "createTime": "2025-01-01 00:00:00",
            "duration": 198.44
          }
        ]
      }
    }
    ```
  </TabItem>
  <TabItem value="text" label="Text Generation Complete Callback">
    ```json
    {
      "code": 200,
      "msg": "Text generation completed.",
      "data": {
        "callbackType": "text",
        "task_id": "2fac****9f72",
        "data": []
      }
    }
    ```
  </TabItem>
  <TabItem value="failure" label="Failure Callback">
    ```json
    {
      "code": 501,
      "msg": "Audio generation failed.",
      "data": {
        "callbackType": "error",
        "task_id": "2fac****9f72",
        "data": []
      }
    }
    ```
  </TabItem>
</Tabs>

## Status Code Description

### code (integer, required)

Callback status code indicating task processing result:

| Status Code | Description |
|-------------|-------------|
| 200 | Success - Request has been processed successfully |
| 400 | Validation Error - Lyrics contained copyrighted material |
| 408 | Rate Limited - Timeout |
| 413 | Conflict - Uploaded audio matches existing work of art |
| 500 | Server Error - An unexpected error occurred while processing the request |
| 501 | Audio generation failed |
| 531 | Server Error - Sorry, the generation failed due to an issue. Your credits have been refunded. Please try again |

### msg (string, required)

Status message providing detailed status description

### data.callbackType (string, required)

Callback type indicating the stage of generation:
- **text**: Text generation complete
- **first**: First track complete
- **complete**: All tracks complete
- **error**: Generation failed

### data.task_id (string, required)

Task ID, consistent with the taskId returned when you submitted the task

### data.data (array, required)

Array of generated audio tracks. Empty for text callbacks or failures.

### data.data[].id (string)

Audio unique identifier (audioId)

### data.data[].audio_url (string)

Generated audio file URL for download

### data.data[].source_audio_url (string)

Original source audio file URL

### data.data[].stream_audio_url (string)

Generated streaming audio URL for real-time playback

### data.data[].source_stream_audio_url (string)

Original source streaming audio URL

### data.data[].image_url (string)

Generated cover image URL

### data.data[].source_image_url (string)

Original source cover image URL

### data.data[].prompt (string)

Generation prompt/lyrics used

### data.data[].model_name (string)

Model name used for generation (e.g., "chirp-v3-5")

### data.data[].title (string)

Music title

### data.data[].tags (string)

Music tags/genre

### data.data[].createTime (string)

Creation timestamp

### data.data[].duration (number)

Audio duration in seconds

## Callback Reception Examples

Here are example codes for receiving callbacks in popular programming languages:

<Tabs>
  <TabItem value="nodejs" label="Node.js">
    ```javascript
    const express = require('express');
    const fs = require('fs');
    const https = require('https');
    const app = express();

    app.use(express.json());

    app.post('/suno-cover-callback', (req, res) => {
      const { code, msg, data } = req.body;
      
      console.log('Received Suno audio cover callback:', {
        taskId: data.task_id,
        callbackType: data.callbackType,
        status: code,
        message: msg
      });
      
      if (code === 200) {
        // Task progressed or completed successfully
        const { callbackType, task_id, data: tracks } = data;
        
        console.log(`Callback type: ${callbackType}`);
        console.log(`Number of tracks: ${tracks.length}`);
        
        switch (callbackType) {
          case 'text':
            console.log('Text generation completed, waiting for audio...');
            break;
            
          case 'first':
            console.log('First track completed, processing remaining tracks...');
            downloadTracks(tracks, task_id);
            break;
            
          case 'complete':
            console.log('All tracks completed successfully!');
            downloadTracks(tracks, task_id);
            break;
        }
        
      } else {
        // Task failed
        console.log('Suno audio cover failed:', msg);
        
        // Handle specific error types
        if (code === 400) {
          console.log('Validation error - check for copyrighted content');
        } else if (code === 408) {
          console.log('Rate limited - please wait before retrying');
        } else if (code === 413) {
          console.log('Content conflict - uploaded audio matches existing work');
        } else if (code === 501) {
          console.log('Generation failed - may need to adjust parameters');
        } else if (code === 531) {
          console.log('Server error with credit refund - safe to retry');
        }
      }
      
      // Return 200 status code to confirm callback received
      res.status(200).json({ status: 'received' });
    });

    // Function to download tracks
    function downloadTracks(tracks, taskId) {
      tracks.forEach((track, index) => {
        const { 
          id, 
          audio_url, 
          source_audio_url,
          image_url, 
          source_image_url,
          title, 
          duration 
        } = track;
        
        console.log(`Track ${index + 1}: ${title} (${duration}s)`);
        
        // Download generated audio file
        if (audio_url) {
          downloadFile(audio_url, `suno_cover_${taskId}_${id}.mp3`)
            .then(() => console.log(`Generated audio downloaded: ${id}`))
            .catch(err => console.error(`Generated audio download failed for ${id}:`, err));
        }
        
        // Download source audio file
        if (source_audio_url) {
          downloadFile(source_audio_url, `suno_source_${taskId}_${id}.mp3`)
            .then(() => console.log(`Source audio downloaded: ${id}`))
            .catch(err => console.error(`Source audio download failed for ${id}:`, err));
        }
        
        // Download generated cover image
        if (image_url) {
          downloadFile(image_url, `suno_cover_img_${taskId}_${id}.jpeg`)
            .then(() => console.log(`Generated cover downloaded: ${id}`))
            .catch(err => console.error(`Generated cover download failed for ${id}:`, err));
        }
        
        // Download source cover image
        if (source_image_url) {
          downloadFile(source_image_url, `suno_source_img_${taskId}_${id}.jpeg`)
            .then(() => console.log(`Source cover downloaded: ${id}`))
            .catch(err => console.error(`Source cover download failed for ${id}:`, err));
        }
      });
    }

    // Helper function to download files
    function downloadFile(url, filename) {
      return new Promise((resolve, reject) => {
        const file = fs.createWriteStream(filename);
        
        https.get(url, (response) => {
          if (response.statusCode === 200) {
            response.pipe(file);
            file.on('finish', () => {
              file.close();
              resolve();
            });
          } else {
            reject(new Error(`HTTP ${response.statusCode}`));
          }
        }).on('error', reject);
      });
    }

    app.listen(3000, () => {
      console.log('Callback server running on port 3000');
    });
    ```
  </TabItem>

  <TabItem value="python" label="Python">
    ```python
    from flask import Flask, request, jsonify
    import requests
    import os

    app = Flask(__name__)

    @app.route('/suno-cover-callback', methods=['POST'])
    def handle_callback():
        data = request.json
        
        code = data.get('code')
        msg = data.get('msg')
        callback_data = data.get('data', {})
        callback_type = callback_data.get('callbackType')
        task_id = callback_data.get('task_id')
        tracks = callback_data.get('data', [])
        
        print(f"Received Suno audio cover callback:")
        print(f"Task ID: {task_id}, Type: {callback_type}")
        print(f"Status: {code}, Message: {msg}")
        
        if code == 200:
            # Task progressed or completed successfully
            print(f"Callback type: {callback_type}")
            print(f"Number of tracks: {len(tracks)}")
            
            if callback_type == 'text':
                print("Text generation completed, waiting for audio...")
            elif callback_type == 'first':
                print("First track completed, processing remaining tracks...")
                download_tracks(tracks, task_id)
            elif callback_type == 'complete':
                print("All tracks completed successfully!")
                download_tracks(tracks, task_id)
                
        else:
            # Task failed
            print(f"Suno audio cover failed: {msg}")
            
            # Handle specific error types
            if code == 400:
                print("Validation error - check for copyrighted content")
            elif code == 408:
                print("Rate limited - please wait before retrying")
            elif code == 413:
                print("Content conflict - uploaded audio matches existing work")
            elif code == 501:
                print("Generation failed - may need to adjust parameters")
            elif code == 531:
                print("Server error with credit refund - safe to retry")
        
        # Return 200 status code to confirm callback received
        return jsonify({'status': 'received'}), 200

    def download_tracks(tracks, task_id):
        """Download audio tracks and cover images"""
        for i, track in enumerate(tracks):
            track_id = track.get('id')
            audio_url = track.get('audio_url')
            source_audio_url = track.get('source_audio_url')
            image_url = track.get('image_url')
            source_image_url = track.get('source_image_url')
            title = track.get('title')
            duration = track.get('duration')
            
            print(f"Track {i + 1}: {title} ({duration}s)")
            
            # Download generated audio file
            if audio_url:
                try:
                    audio_filename = f"suno_cover_{task_id}_{track_id}.mp3"
                    download_file(audio_url, audio_filename)
                    print(f"Generated audio downloaded: {track_id}")
                except Exception as e:
                    print(f"Generated audio download failed for {track_id}: {e}")
            
            # Download source audio file
            if source_audio_url:
                try:
                    source_audio_filename = f"suno_source_{task_id}_{track_id}.mp3"
                    download_file(source_audio_url, source_audio_filename)
                    print(f"Source audio downloaded: {track_id}")
                except Exception as e:
                    print(f"Source audio download failed for {track_id}: {e}")
            
            # Download generated cover image
            if image_url:
                try:
                    image_filename = f"suno_cover_img_{task_id}_{track_id}.jpeg"
                    download_file(image_url, image_filename)
                    print(f"Generated cover downloaded: {track_id}")
                except Exception as e:
                    print(f"Generated cover download failed for {track_id}: {e}")
            
            # Download source cover image
            if source_image_url:
                try:
                    source_image_filename = f"suno_source_img_{task_id}_{track_id}.jpeg"
                    download_file(source_image_url, source_image_filename)
                    print(f"Source cover downloaded: {track_id}")
                except Exception as e:
                    print(f"Source cover download failed for {track_id}: {e}")

    def download_file(url, filename):
        """Download file from URL and save locally"""
        response = requests.get(url, stream=True)
        response.raise_for_status()
        
        os.makedirs('downloads', exist_ok=True)
        filepath = os.path.join('downloads', filename)
        
        with open(filepath, 'wb') as f:
            for chunk in response.iter_content(chunk_size=8192):
                f.write(chunk)

    if __name__ == '__main__':
        app.run(host='0.0.0.0', port=3000)
    ```
  </TabItem>

  <TabItem value="php" label="PHP">
    ```php
    <?php
    header('Content-Type: application/json');

    // Get POST data
    $input = file_get_contents('php://input');
    $data = json_decode($input, true);

    $code = $data['code'] ?? null;
    $msg = $data['msg'] ?? '';
    $callbackData = $data['data'] ?? [];
    $callbackType = $callbackData['callbackType'] ?? '';
    $taskId = $callbackData['task_id'] ?? '';
    $tracks = $callbackData['data'] ?? [];

    error_log("Received Suno audio cover callback:");
    error_log("Task ID: $taskId, Type: $callbackType");
    error_log("Status: $code, Message: $msg");

    if ($code === 200) {
        // Task progressed or completed successfully
        error_log("Callback type: $callbackType");
        error_log("Number of tracks: " . count($tracks));
        
        switch ($callbackType) {
            case 'text':
                error_log("Text generation completed, waiting for audio...");
                break;
                
            case 'first':
                error_log("First track completed, processing remaining tracks...");
                downloadTracks($tracks, $taskId);
                break;
                
            case 'complete':
                error_log("All tracks completed successfully!");
                downloadTracks($tracks, $taskId);
                break;
        }
        
    } else {
        // Task failed
        error_log("Suno audio cover failed: $msg");
        
        // Handle specific error types
        if ($code === 400) {
            error_log("Validation error - check for copyrighted content");
        } elseif ($code === 408) {
            error_log("Rate limited - please wait before retrying");
        } elseif ($code === 413) {
            error_log("Content conflict - uploaded audio matches existing work");
        } elseif ($code === 501) {
            error_log("Generation failed - may need to adjust parameters");
        } elseif ($code === 531) {
            error_log("Server error with credit refund - safe to retry");
        }
    }

    // Return 200 status code to confirm callback received
    http_response_code(200);
    echo json_encode(['status' => 'received']);

    function downloadTracks($tracks, $taskId) {
        foreach ($tracks as $i => $track) {
            $trackId = $track['id'] ?? '';
            $audioUrl = $track['audio_url'] ?? '';
            $sourceAudioUrl = $track['source_audio_url'] ?? '';
            $imageUrl = $track['image_url'] ?? '';
            $sourceImageUrl = $track['source_image_url'] ?? '';
            $title = $track['title'] ?? '';
            $duration = $track['duration'] ?? 0;
            
            error_log("Track " . ($i + 1) . ": $title ({$duration}s)");
            
            // Download generated audio file
            if (!empty($audioUrl)) {
                try {
                    $audioFilename = "suno_cover_{$taskId}_{$trackId}.mp3";
                    downloadFile($audioUrl, $audioFilename);
                    error_log("Generated audio downloaded: $trackId");
                } catch (Exception $e) {
                    error_log("Generated audio download failed for $trackId: " . $e->getMessage());
                }
            }
            
            // Download source audio file
            if (!empty($sourceAudioUrl)) {
                try {
                    $sourceAudioFilename = "suno_source_{$taskId}_{$trackId}.mp3";
                    downloadFile($sourceAudioUrl, $sourceAudioFilename);
                    error_log("Source audio downloaded: $trackId");
                } catch (Exception $e) {
                    error_log("Source audio download failed for $trackId: " . $e->getMessage());
                }
            }
            
            // Download generated cover image
            if (!empty($imageUrl)) {
                try {
                    $imageFilename = "suno_cover_img_{$taskId}_{$trackId}.jpeg";
                    downloadFile($imageUrl, $imageFilename);
                    error_log("Generated cover downloaded: $trackId");
                } catch (Exception $e) {
                    error_log("Generated cover download failed for $trackId: " . $e->getMessage());
                }
            }
            
            // Download source cover image
            if (!empty($sourceImageUrl)) {
                try {
                    $sourceImageFilename = "suno_source_img_{$taskId}_{$trackId}.jpeg";
                    downloadFile($sourceImageUrl, $sourceImageFilename);
                    error_log("Source cover downloaded: $trackId");
                } catch (Exception $e) {
                    error_log("Source cover download failed for $trackId: " . $e->getMessage());
                }
            }
        }
    }

    function downloadFile($url, $filename) {
        $downloadDir = 'downloads';
        if (!is_dir($downloadDir)) {
            mkdir($downloadDir, 0755, true);
        }
        
        $filepath = $downloadDir . '/' . $filename;
        
        $fileContent = file_get_contents($url);
        if ($fileContent === false) {
            throw new Exception("Failed to download file from URL");
        }
        
        $result = file_put_contents($filepath, $fileContent);
        if ($result === false) {
            throw new Exception("Failed to save file locally");
        }
    }
    ?>
    ```
  </TabItem>
</Tabs>

## Best Practices

:::tip Callback URL Configuration Recommendations
1. **Use HTTPS**: Ensure your callback URL uses HTTPS protocol for secure data transmission
2. **Verify Source**: Verify the legitimacy of the request source in callback processing
3. **Idempotent Processing**: The same task_id may receive multiple callbacks, ensure processing logic is idempotent
4. **Quick Response**: Callback processing should return a 200 status code as quickly as possible to avoid timeout
5. **Asynchronous Processing**: Complex business logic should be processed asynchronously to avoid blocking callback response
6. **Handle Multiple Callbacks**: Be prepared to receive text, first, and complete callbacks for the same task
7. **Download Both Versions**: Consider downloading both generated and source files for comparison
:::

:::warning Important Reminders
- Callback URL must be a publicly accessible address
- Server must respond within 15 seconds, otherwise it will be considered a timeout
- If 3 consecutive retries fail, the system will stop sending callbacks
- You may receive multiple callbacks for the same task (text → first → complete)
- Please ensure the stability of callback processing logic to avoid callback failures due to exceptions
- Handle copyright and conflict errors appropriately (codes 400, 413)
- Credit refunds are automatic for certain server errors (code 531)
- Be aware of both generated and source file URLs for complete asset management
:::

## Troubleshooting

If you do not receive callback notifications, please check the following:

<details>
  <summary>Network Connection Issues</summary>

- Confirm that the callback URL is accessible from the public network
- Check firewall settings to ensure inbound requests are not blocked
- Verify that domain name resolution is correct
</details>

<details>
  <summary>Server Response Issues</summary>

- Ensure the server returns HTTP 200 status code within 15 seconds
- Check server logs for error messages
- Verify that the interface path and HTTP method are correct
</details>

<details>
  <summary>Content Format Issues</summary>

- Confirm that the received POST request body is in JSON format
- Check that Content-Type is application/json
- Verify that JSON parsing is correct
</details>

<details>
  <summary>Audio Processing Issues</summary>

- Confirm that audio URLs are accessible
- Check audio download permissions and network connections
- Verify audio save paths and permissions
- Handle both regular and streaming audio URLs appropriately
- Process multiple tracks in the same callback
- Download both generated and source audio files as needed
</details>

<details>
  <summary>Copyright and Content Issues</summary>

- Review error messages for copyright violations (code 400)
- Check for content conflicts with existing works (code 413)
- Ensure compliance with platform content policies
- Adjust uploaded audio or prompts if flagged
- Verify uploaded audio originality
</details>

<details>
  <summary>Rate Limiting Issues</summary>

- Handle timeout errors gracefully (code 408)
- Implement appropriate retry logic with backoff
- Monitor API usage to avoid rate limits
- Consider upgrading service plan if needed
</details>

<details>
  <summary>File Management Issues</summary>

- Organize downloaded files by type (generated vs source)
- Implement proper file naming conventions
- Handle potential duplicate downloads gracefully
- Monitor disk space for large audio files
</details>

## Alternative Solution

If you cannot use the callback mechanism, you can also use polling:

<Card
  title="Poll Query Results"
  icon="lucide-radar"
  href="/suno-api/get-music-details"
>
  Use the get music details endpoint to regularly query task status. We recommend querying every 30 seconds.
</Card>


# ========== upload-and-extend-audio-callbacks ==========

# Audio Upload and Extension Callbacks

System will call this callback when audio generation is complete

When you submit an audio upload and extension task to the Suno API, you can use the `callBackUrl` parameter to set a callback URL. The system will automatically push the results to your specified address when the task is completed.

## Callback Mechanism Overview

:::info[]
The callback mechanism eliminates the need to poll the API for task status. The system will proactively push task completion results to your server.
:::

:::tip Webhook Security
To ensure the authenticity and integrity of callback requests, we strongly recommend implementing webhook signature verification. See our [Webhook Verification Guide](/common-api/webhook-verification) for detailed implementation steps.
:::

### Callback Timing

The system will send callback notifications in the following situations:
- Text generation completed (callbackType: "text")
- First audio track generation completed (callbackType: "first")
- All audio tracks generation completed (callbackType: "complete")
- Audio generation task failed
- Errors occurred during task processing

### Callback Method

- **HTTP Method**: POST
- **Content Type**: application/json
- **Timeout Setting**: 15 seconds

## Callback Request Format

When the task progresses or completes, the system will send a POST request to your `callBackUrl` in the following format:

<Tabs>
  <TabItem value="complete" label="Complete Success Callback">
    ```json
    {
      "code": 200,
      "msg": "All generated successfully.",
      "data": {
        "callbackType": "complete",
        "task_id": "2fac****9f72",
        "data": [
          {
            "id": "e231****-****-****-****-****8cadc7dc",
            "audio_url": "https://example.cn/****.mp3",
            "source_audio_url": "https://example.cn/****.mp3",
            "stream_audio_url": "https://example.cn/****",
            "source_stream_audio_url": "https://example.cn/****",
            "image_url": "https://example.cn/****.jpeg",
            "source_image_url": "https://example.cn/****.jpeg",
            "prompt": "[Verse] Night city lights shining bright",
            "model_name": "chirp-v3-5",
            "title": "Iron Man",
            "tags": "electrifying, rock",
            "createTime": "2025-01-01 00:00:00",
            "duration": 198.44
          }
        ]
      }
    }
    ```
  </TabItem>
  <TabItem value="first" label="First Track Complete Callback">
    ```json
    {
      "code": 200,
      "msg": "First track generated successfully.",
      "data": {
        "callbackType": "first",
        "task_id": "2fac****9f72",
        "data": [
          {
            "id": "e231****-****-****-****-****8cadc7dc",
            "audio_url": "https://example.cn/****.mp3",
            "source_audio_url": "https://example.cn/****.mp3",
            "stream_audio_url": "https://example.cn/****",
            "source_stream_audio_url": "https://example.cn/****",
            "image_url": "https://example.cn/****.jpeg",
            "source_image_url": "https://example.cn/****.jpeg",
            "prompt": "[Verse] Night city lights shining bright",
            "model_name": "chirp-v3-5",
            "title": "Iron Man",
            "tags": "electrifying, rock",
            "createTime": "2025-01-01 00:00:00",
            "duration": 198.44
          }
        ]
      }
    }
    ```
  </TabItem>
  <TabItem value="text" label="Text Generation Complete Callback">
    ```json
    {
      "code": 200,
      "msg": "Text generation completed.",
      "data": {
        "callbackType": "text",
        "task_id": "2fac****9f72",
        "data": []
      }
    }
    ```
  </TabItem>
  <TabItem value="failure" label="Failure Callback">
    ```json
    {
      "code": 501,
      "msg": "Audio generation failed.",
      "data": {
        "callbackType": "error",
        "task_id": "2fac****9f72",
        "data": []
      }
    }
    ```
  </TabItem>
</Tabs>

## Status Code Description

### code (integer, required)

Callback status code indicating task processing result:

| Status Code | Description |
|-------------|-------------|
| 200 | Success - Request has been processed successfully |
| 400 | Validation Error - Lyrics contained copyrighted material |
| 408 | Rate Limited - Timeout |
| 413 | Conflict - Uploaded audio matches existing work of art |
| 500 | Server Error - An unexpected error occurred while processing the request |
| 501 | Audio generation failed |
| 531 | Server Error - Sorry, the generation failed due to an issue. Your credits have been refunded. Please try again |

### msg (string, required)

Status message providing detailed status description

### data.callbackType (string, required)

Callback type indicating the stage of generation:
- **text**: Text generation complete
- **first**: First track complete
- **complete**: All tracks complete
- **error**: Generation failed

### data.task_id (string, required)

Task ID, consistent with the taskId returned when you submitted the task

### data.data (array, required)

Array of generated audio tracks. Empty for text callbacks or failures.

### data.data[].id (string)

Audio unique identifier (audioId)

### data.data[].audio_url (string)

Extended audio file URL for download

### data.data[].source_audio_url (string)

Original source audio file URL

### data.data[].stream_audio_url (string)

Extended streaming audio URL for real-time playback

### data.data[].source_stream_audio_url (string)

Original source streaming audio URL

### data.data[].image_url (string)

Extended cover image URL

### data.data[].source_image_url (string)

Original source cover image URL

### data.data[].prompt (string)

Generation prompt/lyrics used

### data.data[].model_name (string)

Model name used for generation (e.g., "chirp-v3-5")

### data.data[].title (string)

Music title

### data.data[].tags (string)

Music tags/genre

### data.data[].createTime (string)

Creation timestamp

### data.data[].duration (number)

Audio duration in seconds

## Callback Reception Examples

Here are example codes for receiving callbacks in popular programming languages:

<Tabs>
  <TabItem value="nodejs" label="Node.js">
    ```javascript
    const express = require('express');
    const fs = require('fs');
    const https = require('https');
    const app = express();

    app.use(express.json());

    app.post('/suno-extend-callback', (req, res) => {
      const { code, msg, data } = req.body;
      
      console.log('Received Suno audio extension callback:', {
        taskId: data.task_id,
        callbackType: data.callbackType,
        status: code,
        message: msg
      });
      
      if (code === 200) {
        // Task progressed or completed successfully
        const { callbackType, task_id, data: tracks } = data;
        
        console.log(`Callback type: ${callbackType}`);
        console.log(`Number of tracks: ${tracks.length}`);
        
        switch (callbackType) {
          case 'text':
            console.log('Text generation completed, waiting for audio...');
            break;
            
          case 'first':
            console.log('First track completed, processing remaining tracks...');
            downloadTracks(tracks, task_id);
            break;
            
          case 'complete':
            console.log('All tracks completed successfully!');
            downloadTracks(tracks, task_id);
            break;
        }
        
      } else {
        // Task failed
        console.log('Suno audio extension failed:', msg);
        
        // Handle specific error types
        if (code === 400) {
          console.log('Validation error - check for copyrighted content');
        } else if (code === 408) {
          console.log('Rate limited - please wait before retrying');
        } else if (code === 413) {
          console.log('Content conflict - uploaded audio matches existing work');
        } else if (code === 501) {
          console.log('Generation failed - may need to adjust parameters');
        } else if (code === 531) {
          console.log('Server error with credit refund - safe to retry');
        }
      }
      
      // Return 200 status code to confirm callback received
      res.status(200).json({ status: 'received' });
    });

    // Function to download tracks
    function downloadTracks(tracks, taskId) {
      tracks.forEach((track, index) => {
        const { 
          id, 
          audio_url, 
          source_audio_url,
          image_url, 
          source_image_url,
          title, 
          duration 
        } = track;
        
        console.log(`Track ${index + 1}: ${title} (${duration}s)`);
        
        // Download extended audio file
        if (audio_url) {
          downloadFile(audio_url, `suno_extended_${taskId}_${id}.mp3`)
            .then(() => console.log(`Extended audio downloaded: ${id}`))
            .catch(err => console.error(`Extended audio download failed for ${id}:`, err));
        }
        
        // Download source audio file
        if (source_audio_url) {
          downloadFile(source_audio_url, `suno_source_${taskId}_${id}.mp3`)
            .then(() => console.log(`Source audio downloaded: ${id}`))
            .catch(err => console.error(`Source audio download failed for ${id}:`, err));
        }
        
        // Download extended cover image
        if (image_url) {
          downloadFile(image_url, `suno_extended_cover_${taskId}_${id}.jpeg`)
            .then(() => console.log(`Extended cover downloaded: ${id}`))
            .catch(err => console.error(`Extended cover download failed for ${id}:`, err));
        }
        
        // Download source cover image
        if (source_image_url) {
          downloadFile(source_image_url, `suno_source_cover_${taskId}_${id}.jpeg`)
            .then(() => console.log(`Source cover downloaded: ${id}`))
            .catch(err => console.error(`Source cover download failed for ${id}:`, err));
        }
      });
    }

    // Helper function to download files
    function downloadFile(url, filename) {
      return new Promise((resolve, reject) => {
        const file = fs.createWriteStream(filename);
        
        https.get(url, (response) => {
          if (response.statusCode === 200) {
            response.pipe(file);
            file.on('finish', () => {
              file.close();
              resolve();
            });
          } else {
            reject(new Error(`HTTP ${response.statusCode}`));
          }
        }).on('error', reject);
      });
    }

    app.listen(3000, () => {
      console.log('Callback server running on port 3000');
    });
    ```
  </TabItem>

  <TabItem value="python" label="Python">
    ```python
    from flask import Flask, request, jsonify
    import requests
    import os

    app = Flask(__name__)

    @app.route('/suno-extend-callback', methods=['POST'])
    def handle_callback():
        data = request.json
        
        code = data.get('code')
        msg = data.get('msg')
        callback_data = data.get('data', {})
        callback_type = callback_data.get('callbackType')
        task_id = callback_data.get('task_id')
        tracks = callback_data.get('data', [])
        
        print(f"Received Suno audio extension callback:")
        print(f"Task ID: {task_id}, Type: {callback_type}")
        print(f"Status: {code}, Message: {msg}")
        
        if code == 200:
            # Task progressed or completed successfully
            print(f"Callback type: {callback_type}")
            print(f"Number of tracks: {len(tracks)}")
            
            if callback_type == 'text':
                print("Text generation completed, waiting for audio...")
            elif callback_type == 'first':
                print("First track completed, processing remaining tracks...")
                download_tracks(tracks, task_id)
            elif callback_type == 'complete':
                print("All tracks completed successfully!")
                download_tracks(tracks, task_id)
                
        else:
            # Task failed
            print(f"Suno audio extension failed: {msg}")
            
            # Handle specific error types
            if code == 400:
                print("Validation error - check for copyrighted content")
            elif code == 408:
                print("Rate limited - please wait before retrying")
            elif code == 413:
                print("Content conflict - uploaded audio matches existing work")
            elif code == 501:
                print("Generation failed - may need to adjust parameters")
            elif code == 531:
                print("Server error with credit refund - safe to retry")
        
        # Return 200 status code to confirm callback received
        return jsonify({'status': 'received'}), 200

    def download_tracks(tracks, task_id):
        """Download audio tracks and cover images"""
        for i, track in enumerate(tracks):
            track_id = track.get('id')
            audio_url = track.get('audio_url')
            source_audio_url = track.get('source_audio_url')
            image_url = track.get('image_url')
            source_image_url = track.get('source_image_url')
            title = track.get('title')
            duration = track.get('duration')
            
            print(f"Track {i + 1}: {title} ({duration}s)")
            
            # Download extended audio file
            if audio_url:
                try:
                    audio_filename = f"suno_extended_{task_id}_{track_id}.mp3"
                    download_file(audio_url, audio_filename)
                    print(f"Extended audio downloaded: {track_id}")
                except Exception as e:
                    print(f"Extended audio download failed for {track_id}: {e}")
            
            # Download source audio file
            if source_audio_url:
                try:
                    source_audio_filename = f"suno_source_{task_id}_{track_id}.mp3"
                    download_file(source_audio_url, source_audio_filename)
                    print(f"Source audio downloaded: {track_id}")
                except Exception as e:
                    print(f"Source audio download failed for {track_id}: {e}")
            
            # Download extended cover image
            if image_url:
                try:
                    image_filename = f"suno_extended_cover_{task_id}_{track_id}.jpeg"
                    download_file(image_url, image_filename)
                    print(f"Extended cover downloaded: {track_id}")
                except Exception as e:
                    print(f"Extended cover download failed for {track_id}: {e}")
            
            # Download source cover image
            if source_image_url:
                try:
                    source_image_filename = f"suno_source_cover_{task_id}_{track_id}.jpeg"
                    download_file(source_image_url, source_image_filename)
                    print(f"Source cover downloaded: {track_id}")
                except Exception as e:
                    print(f"Source cover download failed for {track_id}: {e}")

    def download_file(url, filename):
        """Download file from URL and save locally"""
        response = requests.get(url, stream=True)
        response.raise_for_status()
        
        os.makedirs('downloads', exist_ok=True)
        filepath = os.path.join('downloads', filename)
        
        with open(filepath, 'wb') as f:
            for chunk in response.iter_content(chunk_size=8192):
                f.write(chunk)

    if __name__ == '__main__':
        app.run(host='0.0.0.0', port=3000)
    ```
  </TabItem>

  <TabItem value="php" label="PHP">
    ```php
    <?php
    header('Content-Type: application/json');

    // Get POST data
    $input = file_get_contents('php://input');
    $data = json_decode($input, true);

    $code = $data['code'] ?? null;
    $msg = $data['msg'] ?? '';
    $callbackData = $data['data'] ?? [];
    $callbackType = $callbackData['callbackType'] ?? '';
    $taskId = $callbackData['task_id'] ?? '';
    $tracks = $callbackData['data'] ?? [];

    error_log("Received Suno audio extension callback:");
    error_log("Task ID: $taskId, Type: $callbackType");
    error_log("Status: $code, Message: $msg");

    if ($code === 200) {
        // Task progressed or completed successfully
        error_log("Callback type: $callbackType");
        error_log("Number of tracks: " . count($tracks));
        
        switch ($callbackType) {
            case 'text':
                error_log("Text generation completed, waiting for audio...");
                break;
                
            case 'first':
                error_log("First track completed, processing remaining tracks...");
                downloadTracks($tracks, $taskId);
                break;
                
            case 'complete':
                error_log("All tracks completed successfully!");
                downloadTracks($tracks, $taskId);
                break;
        }
        
    } else {
        // Task failed
        error_log("Suno audio extension failed: $msg");
        
        // Handle specific error types
        if ($code === 400) {
            error_log("Validation error - check for copyrighted content");
        } elseif ($code === 408) {
            error_log("Rate limited - please wait before retrying");
        } elseif ($code === 413) {
            error_log("Content conflict - uploaded audio matches existing work");
        } elseif ($code === 501) {
            error_log("Generation failed - may need to adjust parameters");
        } elseif ($code === 531) {
            error_log("Server error with credit refund - safe to retry");
        }
    }

    // Return 200 status code to confirm callback received
    http_response_code(200);
    echo json_encode(['status' => 'received']);

    function downloadTracks($tracks, $taskId) {
        foreach ($tracks as $i => $track) {
            $trackId = $track['id'] ?? '';
            $audioUrl = $track['audio_url'] ?? '';
            $sourceAudioUrl = $track['source_audio_url'] ?? '';
            $imageUrl = $track['image_url'] ?? '';
            $sourceImageUrl = $track['source_image_url'] ?? '';
            $title = $track['title'] ?? '';
            $duration = $track['duration'] ?? 0;
            
            error_log("Track " . ($i + 1) . ": $title ({$duration}s)");
            
            // Download extended audio file
            if (!empty($audioUrl)) {
                try {
                    $audioFilename = "suno_extended_{$taskId}_{$trackId}.mp3";
                    downloadFile($audioUrl, $audioFilename);
                    error_log("Extended audio downloaded: $trackId");
                } catch (Exception $e) {
                    error_log("Extended audio download failed for $trackId: " . $e->getMessage());
                }
            }
            
            // Download source audio file
            if (!empty($sourceAudioUrl)) {
                try {
                    $sourceAudioFilename = "suno_source_{$taskId}_{$trackId}.mp3";
                    downloadFile($sourceAudioUrl, $sourceAudioFilename);
                    error_log("Source audio downloaded: $trackId");
                } catch (Exception $e) {
                    error_log("Source audio download failed for $trackId: " . $e->getMessage());
                }
            }
            
            // Download extended cover image
            if (!empty($imageUrl)) {
                try {
                    $imageFilename = "suno_extended_cover_{$taskId}_{$trackId}.jpeg";
                    downloadFile($imageUrl, $imageFilename);
                    error_log("Extended cover downloaded: $trackId");
                } catch (Exception $e) {
                    error_log("Extended cover download failed for $trackId: " . $e->getMessage());
                }
            }
            
            // Download source cover image
            if (!empty($sourceImageUrl)) {
                try {
                    $sourceImageFilename = "suno_source_cover_{$taskId}_{$trackId}.jpeg";
                    downloadFile($sourceImageUrl, $sourceImageFilename);
                    error_log("Source cover downloaded: $trackId");
                } catch (Exception $e) {
                    error_log("Source cover download failed for $trackId: " . $e->getMessage());
                }
            }
        }
    }

    function downloadFile($url, $filename) {
        $downloadDir = 'downloads';
        if (!is_dir($downloadDir)) {
            mkdir($downloadDir, 0755, true);
        }
        
        $filepath = $downloadDir . '/' . $filename;
        
        $fileContent = file_get_contents($url);
        if ($fileContent === false) {
            throw new Exception("Failed to download file from URL");
        }
        
        $result = file_put_contents($filepath, $fileContent);
        if ($result === false) {
            throw new Exception("Failed to save file locally");
        }
    }
    ?>
    ```
  </TabItem>
</Tabs>

## Best Practices

:::tip Callback URL Configuration Recommendations
1. **Use HTTPS**: Ensure your callback URL uses HTTPS protocol for secure data transmission
2. **Verify Source**: Verify the legitimacy of the request source in callback processing
3. **Idempotent Processing**: The same task_id may receive multiple callbacks, ensure processing logic is idempotent
4. **Quick Response**: Callback processing should return a 200 status code as quickly as possible to avoid timeout
5. **Asynchronous Processing**: Complex business logic should be processed asynchronously to avoid blocking callback response
6. **Handle Multiple Callbacks**: Be prepared to receive text, first, and complete callbacks for the same task
7. **Download Both Versions**: Consider downloading both extended and source files for comparison
:::

:::warning Important Reminders
- Callback URL must be a publicly accessible address
- Server must respond within 15 seconds, otherwise it will be considered a timeout
- If 3 consecutive retries fail, the system will stop sending callbacks
- You may receive multiple callbacks for the same task (text → first → complete)
- Please ensure the stability of callback processing logic to avoid callback failures due to exceptions
- Handle copyright and conflict errors appropriately (codes 400, 413)
- Credit refunds are automatic for certain server errors (code 531)
- Be aware of both extended and source file URLs for complete asset management
- Generated files will be retained for 14 days
:::

## Troubleshooting

If you do not receive callback notifications, please check the following:

<details>
  <summary>Network Connection Issues</summary>

- Confirm that the callback URL is accessible from the public network
- Check firewall settings to ensure inbound requests are not blocked
- Verify that domain name resolution is correct
</details>

<details>
  <summary>Server Response Issues</summary>

- Ensure the server returns HTTP 200 status code within 15 seconds
- Check server logs for error messages
- Verify that the interface path and HTTP method are correct
</details>

<details>
  <summary>Content Format Issues</summary>

- Confirm that the received POST request body is in JSON format
- Check that Content-Type is application/json
- Verify that JSON parsing is correct
</details>

<details>
  <summary>Audio Processing Issues</summary>

- Confirm that audio URLs are accessible
- Check audio download permissions and network connections
- Verify audio save paths and permissions
- Handle both regular and streaming audio URLs appropriately
- Process multiple tracks in the same callback
- Download both extended and source audio files as needed
</details>

<details>
  <summary>Copyright and Content Issues</summary>

- Review error messages for copyright violations (code 400)
- Check for content conflicts with existing works (code 413)
- Ensure compliance with platform content policies
- Adjust uploaded audio or prompts if flagged
- Verify uploaded audio originality and ensure it doesn't exceed 2 minutes
</details>

<details>
  <summary>Rate Limiting Issues</summary>

- Handle timeout errors gracefully (code 408)
- Implement appropriate retry logic with backoff
- Monitor API usage to avoid rate limits
- Consider upgrading service plan if needed
</details>

<details>
  <summary>Extension-Specific Issues</summary>

- Ensure uploaded audio does not exceed 2 minutes
- Verify continueAt parameter is within valid range (greater than 0 and less than audio duration)
- Check model version compatibility with source music
- Monitor that extended files are properly differentiated from source files
</details>

## Alternative Solution

If you cannot use the callback mechanism, you can also use polling:

<Card
  title="Poll Query Results"
  icon="lucide-radar"
  href="/suno-api/get-music-details"
>
  Use the get music details endpoint to regularly query task status. We recommend querying every 30 seconds.
</Card>



# ========== add-instrumental-callbacks ==========

# Add Instrumental Callbacks

System will call this callback when instrumental generation is complete.

When you submit an instrumental generation task to the Suno API using the `/api/v1/generate/add-instrumental` endpoint, you can use the `callBackUrl` parameter to set a callback URL. The system will automatically push the results to your specified address when the task is completed.

## Related API Endpoint

This callback is triggered by the following API endpoint:

**[Add Instrumental API](/suno-api/add-instrumental)** — **POST** `/api/v1/generate/add-instrumental` - Generate instrumental accompaniment based on uploaded audio files

## Callback Mechanism Overview

:::info[]
The callback mechanism eliminates the need to poll the API for task status. The system will proactively push task completion results to your server.
:::

:::tip Webhook Security
To ensure the authenticity and integrity of callback requests, we strongly recommend implementing webhook signature verification. See our [Webhook Verification Guide](/common-api/webhook-verification) for detailed implementation steps.
:::

### Callback Timing

The system will send callback notifications in the following situations:
- Text generation completed (callbackType: "text")
- First audio track generation completed (callbackType: "first")
- All audio tracks generation completed (callbackType: "complete")
- Instrumental generation task failed
- Errors occurred during task processing

### Callback Method

- **HTTP Method**: POST
- **Content Type**: application/json
- **Timeout Setting**: 15 seconds

## Callback Request Format

When the task progresses or completes, the system will send a POST request to your `callBackUrl` in the following format:

<Tabs>
  <TabItem value="complete" label="Complete Success Callback">
    ```json
    {
      "code": 200,
      "msg": "All generated successfully.",
      "data": {
        "callbackType": "complete",
        "task_id": "2fac****9f72",
        "data": [
          {
            "id": "e231****-****-****-****-****8cadc7dc",
            "audio_url": "https://example.cn/****.mp3",
            "stream_audio_url": "https://example.cn/****",
            "image_url": "https://example.cn/****.jpeg",
            "prompt": "[Verse] Night city lights shining bright",
            "model_name": "chirp-v4-5",
            "title": "Iron Man",
            "tags": "electrifying, rock",
            "createTime": "2025-01-01 00:00:00",
            "duration": 198.44
          }
        ]
      }
    }
    ```
  </TabItem>
  <TabItem value="first" label="First Track Success Callback">
    ```json
    {
      "code": 200,
      "msg": "First track generated successfully.",
      "data": {
        "callbackType": "first",
        "task_id": "2fac****9f72",
        "data": [
          {
            "id": "e231****-****-****-****-****8cadc7dc",
            "audio_url": "https://example.cn/****.mp3",
            "stream_audio_url": "https://example.cn/****",
            "image_url": "https://example.cn/****.jpeg",
            "prompt": "[Verse] Night city lights shining bright",
            "model_name": "chirp-v4-5",
            "title": "Iron Man",
            "tags": "electrifying, rock",
            "createTime": "2025-01-01 00:00:00",
            "duration": 198.44
          }
        ]
      }
    }
    ```
  </TabItem>
  <TabItem value="text" label="Text Generation Callback">
    ```json
    {
      "code": 200,
      "msg": "Text generation completed successfully.",
      "data": {
        "callbackType": "text",
        "task_id": "2fac****9f72",
        "data": []
      }
    }
    ```
  </TabItem>
  <TabItem value="failure" label="Failure Callback">
    ```json
    {
      "code": 501,
      "msg": "Audio generation failed",
      "data": {
        "callbackType": "error",
        "task_id": "2fac****9f72",
        "data": null
      }
    }
    ```
  </TabItem>
</Tabs>

## Status Code Description

| Status Code | Description |
|-------------|-------------|
| 200 | Success - Request has been processed successfully |
| 400 | Validation Error - Lyrics contained copyrighted material |
| 408 | Rate Limited - Timeout |
| 413 | Conflict - Uploaded audio matches existing work of art |
| 500 | Server Error - An unexpected error occurred while processing the request |
| 501 | Audio generation failed |
| 531 | Server Error - Sorry, the generation failed due to an issue. Your credits have been refunded. Please try again |

## Callback Reception Examples

Here are example codes for receiving callbacks in popular programming languages:

<Tabs>
  <TabItem value="nodejs" label="Node.js">
    ```javascript
    const express = require('express');
    const app = express();

    app.use(express.json());

    app.post('/instrumental-callback', (req, res) => {
      const { code, msg, data } = req.body;
      
      console.log('Received instrumental callback:', {
        taskId: data.task_id,
        status: code,
        message: msg,
        callbackType: data.callbackType
      });
      
      if (code === 200) {
        // Task completed successfully
        if (data.callbackType === 'complete') {
          console.log('Instrumental generation completed:', data.data);
          
          // Process generated instrumental data
          data.data.forEach(audio => {
            console.log(`Audio ID: ${audio.id}`);
            console.log(`Audio URL: ${audio.audio_url}`);
            console.log(`Title: ${audio.title}`);
            console.log(`Duration: ${audio.duration} seconds`);
          });
          
        } else if (data.callbackType === 'first') {
          console.log('First track completed');
          
        } else if (data.callbackType === 'text') {
          console.log('Text generation completed');
        }
        
      } else {
        // Task failed
        console.log('Task failed:', msg);
      }
      
      // Return 200 status code to confirm callback received
      res.status(200).json({ status: 'received' });
    });

    app.listen(3000, () => {
      console.log('Instrumental callback server running on port 3000');
    });
    ```
  </TabItem>

  <TabItem value="python" label="Python">
    ```python
    from flask import Flask, request, jsonify

    app = Flask(__name__)

    @app.route('/instrumental-callback', methods=['POST'])
    def handle_callback():
        data = request.json
        
        code = data.get('code')
        msg = data.get('msg')
        callback_data = data.get('data', {})
        task_id = callback_data.get('task_id')
        callback_type = callback_data.get('callbackType')
        
        print(f"Received instrumental callback: {task_id}, status: {code}, type: {callback_type}")
        
        if code == 200:
            # Task completed successfully
            if callback_type == 'complete':
                audio_list = callback_data.get('data', [])
                print(f"Instrumental generation completed, generated {len(audio_list)} tracks")
                
                for audio in audio_list:
                    print(f"Audio ID: {audio['id']}")
                    print(f"Audio URL: {audio['audio_url']}")
                    print(f"Title: {audio['title']}")
                    print(f"Duration: {audio['duration']} seconds")
                    
            elif callback_type == 'first':
                print("First track completed")
                
            elif callback_type == 'text':
                print("Text generation completed")
                
        else:
            # Task failed
            print(f"Task failed: {msg}")
        
        # Return 200 status code to confirm callback received
        return jsonify({'status': 'received'}), 200

    if __name__ == '__main__':
        app.run(host='0.0.0.0', port=3000)
    ```
  </TabItem>

  <TabItem value="php" label="PHP">
    ```php
    <?php
    header('Content-Type: application/json');

    // Get POST data
    $input = file_get_contents('php://input');
    $data = json_decode($input, true);

    $code = $data['code'] ?? null;
    $msg = $data['msg'] ?? '';
    $callbackData = $data['data'] ?? [];
    $taskId = $callbackData['task_id'] ?? '';
    $callbackType = $callbackData['callbackType'] ?? '';

    error_log("Received instrumental callback: $taskId, status: $code, type: $callbackType");

    if ($code === 200) {
        // Task completed successfully
        if ($callbackType === 'complete') {
            $audioList = $callbackData['data'] ?? [];
            error_log("Instrumental generation completed, generated " . count($audioList) . " tracks");
            
            foreach ($audioList as $audio) {
                error_log("Audio ID: " . $audio['id']);
                error_log("Audio URL: " . $audio['audio_url']);
                error_log("Title: " . $audio['title']);
                error_log("Duration: " . $audio['duration'] . " seconds");
            }
            
        } elseif ($callbackType === 'first') {
            error_log("First track completed");
            
        } elseif ($callbackType === 'text') {
            error_log("Text generation completed");
        }
        
    } else {
        // Task failed
        error_log("Task failed: $msg");
    }

    // Return 200 status code to confirm callback received
    http_response_code(200);
    echo json_encode(['status' => 'received']);
    ?>
    ```
  </TabItem>
</Tabs>

## Best Practices

:::tip Callback URL Configuration Recommendations
1. **Use HTTPS**: Ensure your callback URL uses HTTPS protocol for secure data transmission
2. **Verify Source**: Verify the legitimacy of the request source in callback processing
3. **Idempotent Processing**: The same task_id may receive multiple callbacks, ensure processing logic is idempotent
4. **Quick Response**: Callback processing should return a 200 status code as quickly as possible to avoid timeout
5. **Asynchronous Processing**: Complex business logic should be processed asynchronously to avoid blocking callback response
6. **Stage Tracking**: Differentiate between different generation stages based on callbackType and arrange business logic appropriately
:::

:::warning Important Reminders
- Callback URL must be a publicly accessible address
- Server must respond within 15 seconds, otherwise it will be considered a timeout
- If 3 consecutive retries fail, the system will stop sending callbacks
- Please ensure the stability of callback processing logic to avoid callback failures due to exceptions
- Pay attention to handling different callbackType callbacks, especially the complete type for final results
:::

## Alternative Solution

If you cannot use the callback mechanism, you can also use polling:

<Card
  title="Poll Query Results"
  icon="lucide-radar"
  href="/suno-api/get-music-details"
>
  Use the get music details endpoint to regularly query task status. We recommend querying every 30 seconds.
</Card>



# ========== add-vocals-callbacks ==========

# Add Vocals Callbacks

System will call this callback when vocal generation is complete.

When you submit a vocal generation task to the Suno API using the `/api/v1/generate/add-vocals` endpoint, you can use the `callBackUrl` parameter to set a callback URL. The system will automatically push the results to your specified address when the task is completed.

## Related API Endpoint

This callback is triggered by the following API endpoint:

**[Add Vocals API](/suno-api/add-vocals)** — **POST** `/api/v1/generate/add-vocals` - Add vocals to uploaded music files

## Callback Mechanism Overview

:::info[]
The callback mechanism eliminates the need to poll the API for task status. The system will proactively push task completion results to your server.
:::

:::tip Webhook Security
To ensure the authenticity and integrity of callback requests, we strongly recommend implementing webhook signature verification. See our [Webhook Verification Guide](/common-api/webhook-verification) for detailed implementation steps.
:::

### Callback Timing

The system will send callback notifications in the following situations:
- Text generation completed (callbackType: "text")
- First audio track generation completed (callbackType: "first")
- All audio tracks generation completed (callbackType: "complete")
- Vocal generation task failed
- Errors occurred during task processing

### Callback Method

- **HTTP Method**: POST
- **Content Type**: application/json
- **Timeout Setting**: 15 seconds

## Callback Request Format

When the task progresses or completes, the system will send a POST request to your `callBackUrl` in the following format:

<Tabs>
  <TabItem value="complete" label="Complete Success Callback">
    ```json
    {
      "code": 200,
      "msg": "All generated successfully.",
      "data": {
        "callbackType": "complete",
        "task_id": "2fac****9f72",
        "data": [
          {
            "id": "e231****-****-****-****-****8cadc7dc",
            "audio_url": "https://example.cn/****.mp3",
            "stream_audio_url": "https://example.cn/****",
            "image_url": "https://example.cn/****.jpeg",
            "prompt": "[Verse] Night city lights shining bright",
            "model_name": "chirp-v4-5",
            "title": "Iron Man",
            "createTime": "2025-01-01 00:00:00",
            "duration": 198.44
          }
        ]
      }
    }
    ```
  </TabItem>
  <TabItem value="first" label="First Track Success Callback">
    ```json
    {
      "code": 200,
      "msg": "First track generated successfully.",
      "data": {
        "callbackType": "first",
        "task_id": "2fac****9f72",
        "data": [
          {
            "id": "e231****-****-****-****-****8cadc7dc",
            "audio_url": "https://example.cn/****.mp3",
            "stream_audio_url": "https://example.cn/****",
            "image_url": "https://example.cn/****.jpeg",
            "prompt": "[Verse] Night city lights shining bright",
            "model_name": "chirp-v4-5",
            "title": "Iron Man",
            "createTime": "2025-01-01 00:00:00",
            "duration": 198.44
          }
        ]
      }
    }
    ```
  </TabItem>
  <TabItem value="text" label="Text Generation Callback">
    ```json
    {
      "code": 200,
      "msg": "Text generation completed successfully.",
      "data": {
        "callbackType": "text",
        "task_id": "2fac****9f72",
        "data": []
      }
    }
    ```
  </TabItem>
  <TabItem value="failure" label="Failure Callback">
    ```json
    {
      "code": 501,
      "msg": "Audio generation failed",
      "data": {
        "callbackType": "error",
        "task_id": "2fac****9f72",
        "data": null
      }
    }
    ```
  </TabItem>
</Tabs>

## Status Code Description

| Status Code | Description |
|-------------|-------------|
| 200 | Success - Request has been processed successfully |
| 400 | Validation Error - Lyrics contained copyrighted material |
| 408 | Rate Limited - Timeout |
| 413 | Conflict - Uploaded audio matches existing work of art |
| 500 | Server Error - An unexpected error occurred while processing the request |
| 501 | Audio generation failed |
| 531 | Server Error - Sorry, the generation failed due to an issue. Your credits have been refunded. Please try again |

## Callback Reception Examples

Here are example codes for receiving callbacks in popular programming languages:

<Tabs>
  <TabItem value="nodejs" label="Node.js">
    ```javascript
    const express = require('express');
    const app = express();

    app.use(express.json());

    app.post('/vocals-callback', (req, res) => {
      const { code, msg, data } = req.body;
      
      console.log('Received vocals callback:', {
        taskId: data.task_id,
        status: code,
        message: msg,
        callbackType: data.callbackType
      });
      
      if (code === 200) {
        // Task completed successfully
        if (data.callbackType === 'complete') {
          console.log('Vocals generation completed:', data.data);
          
          // Process generated vocals data
          data.data.forEach(audio => {
            console.log(`Audio ID: ${audio.id}`);
            console.log(`Audio URL: ${audio.audio_url}`);
            console.log(`Title: ${audio.title}`);
            console.log(`Duration: ${audio.duration} seconds`);
          });
          
        } else if (data.callbackType === 'first') {
          console.log('First track completed');
          
        } else if (data.callbackType === 'text') {
          console.log('Text generation completed');
        }
        
      } else {
        // Task failed
        console.log('Task failed:', msg);
      }
      
      // Return 200 status code to confirm callback received
      res.status(200).json({ status: 'received' });
    });

    app.listen(3000, () => {
      console.log('Vocals callback server running on port 3000');
    });
    ```
  </TabItem>

  <TabItem value="python" label="Python">
    ```python
    from flask import Flask, request, jsonify

    app = Flask(__name__)

    @app.route('/vocals-callback', methods=['POST'])
    def handle_callback():
        data = request.json
        
        code = data.get('code')
        msg = data.get('msg')
        callback_data = data.get('data', {})
        task_id = callback_data.get('task_id')
        callback_type = callback_data.get('callbackType')
        
        print(f"Received vocals callback: {task_id}, status: {code}, type: {callback_type}")
        
        if code == 200:
            # Task completed successfully
            if callback_type == 'complete':
                audio_list = callback_data.get('data', [])
                print(f"Vocals generation completed, generated {len(audio_list)} tracks")
                
                for audio in audio_list:
                    print(f"Audio ID: {audio['id']}")
                    print(f"Audio URL: {audio['audio_url']}")
                    print(f"Title: {audio['title']}")
                    print(f"Duration: {audio['duration']} seconds")
                    
            elif callback_type == 'first':
                print("First track completed")
                
            elif callback_type == 'text':
                print("Text generation completed")
                
        else:
            # Task failed
            print(f"Task failed: {msg}")
        
        # Return 200 status code to confirm callback received
        return jsonify({'status': 'received'}), 200

    if __name__ == '__main__':
        app.run(host='0.0.0.0', port=3000)
    ```
  </TabItem>

  <TabItem value="php" label="PHP">
    ```php
    <?php
    header('Content-Type: application/json');

    // Get POST data
    $input = file_get_contents('php://input');
    $data = json_decode($input, true);

    $code = $data['code'] ?? null;
    $msg = $data['msg'] ?? '';
    $callbackData = $data['data'] ?? [];
    $taskId = $callbackData['task_id'] ?? '';
    $callbackType = $callbackData['callbackType'] ?? '';

    error_log("Received vocals callback: $taskId, status: $code, type: $callbackType");

    if ($code === 200) {
        // Task completed successfully
        if ($callbackType === 'complete') {
            $audioList = $callbackData['data'] ?? [];
            error_log("Vocals generation completed, generated " . count($audioList) . " tracks");
            
            foreach ($audioList as $audio) {
                error_log("Audio ID: " . $audio['id']);
                error_log("Audio URL: " . $audio['audio_url']);
                error_log("Title: " . $audio['title']);
                error_log("Duration: " . $audio['duration'] . " seconds");
            }
            
        } elseif ($callbackType === 'first') {
            error_log("First track completed");
            
        } elseif ($callbackType === 'text') {
            error_log("Text generation completed");
        }
        
    } else {
        // Task failed
        error_log("Task failed: $msg");
    }

    // Return 200 status code to confirm callback received
    http_response_code(200);
    echo json_encode(['status' => 'received']);
    ?>
    ```
  </TabItem>
</Tabs>

## Best Practices

:::tip Callback URL Configuration Recommendations
1. **Use HTTPS**: Ensure your callback URL uses HTTPS protocol for secure data transmission
2. **Verify Source**: Verify the legitimacy of the request source in callback processing
3. **Idempotent Processing**: The same task_id may receive multiple callbacks, ensure processing logic is idempotent
4. **Quick Response**: Callback processing should return a 200 status code as quickly as possible to avoid timeout
5. **Asynchronous Processing**: Complex business logic should be processed asynchronously to avoid blocking callback response
6. **Stage Tracking**: Differentiate between different generation stages based on callbackType and arrange business logic appropriately
:::

:::warning Important Reminders
- Callback URL must be a publicly accessible address
- Server must respond within 15 seconds, otherwise it will be considered a timeout
- If 3 consecutive retries fail, the system will stop sending callbacks
- Please ensure the stability of callback processing logic to avoid callback failures due to exceptions
- Pay attention to handling different callbackType callbacks, especially the complete type for final results
:::

## Alternative Solution

If you cannot use the callback mechanism, you can also use polling:

<Card
  title="Poll Query Results"
  icon="lucide-radar"
  href="/suno-api/get-music-details"
>
  Use the get music details endpoint to regularly query task status. We recommend querying every 30 seconds.
</Card>



# ========== cover-suno-callbacks ==========

# Music Cover Generation Callbacks

When music cover generation is complete, the system will call this callback to notify results.

When you submit a cover generation task to the Suno API, you can use the `callBackUrl` parameter to set the callback URL. When the task is complete, the system will automatically push results to your specified address.

## Callback Mechanism Overview

:::info[]
The callback mechanism eliminates the need to poll the API for task status. The system will actively push task completion results to your server.
:::

:::tip Webhook Security
To ensure the authenticity and integrity of callback requests, we strongly recommend implementing webhook signature verification. See our [Webhook Verification Guide](/common-api/webhook-verification) for detailed implementation steps.
:::

### Callback Timing

The system will send callback notifications in the following situations:
- Cover generation task completed successfully
- Cover generation task failed
- Error occurred during task processing

### Callback Method

- **HTTP Method**: POST
- **Content Type**: application/json
- **Timeout Setting**: 15 seconds

## Callback Request Format

When the task is complete, the system will send a POST request to your `callBackUrl`:

<Tabs>
  <TabItem value="success" label="Success Callback">
    ```json
    {
      "code": 200,
      "data": {
        "images": [
          "https://tempfile.aiquickdraw.com/s/1753958521_6c1b3015141849d1a9bf17b738ce9347.png",
          "https://tempfile.aiquickdraw.com/s/1753958524_c153143acc6340908431cf0e90cbce9e.png"
        ],
        "taskId": "21aee3c3c2a01fa5e030b3799fa4dd56"
      },
      "msg": "success"
    }
    ```
  </TabItem>
  <TabItem value="failure" label="Failure Callback">
    ```json
    {
      "code": 501,
      "msg": "Cover generation failed",
      "data": {
        "taskId": "21aee3c3c2a01fa5e030b3799fa4dd56",
        "images": null
      }
    }
    ```
  </TabItem>
</Tabs>

## Status Code Description

### code (integer, required)

Callback status code indicating task processing result:

| Status Code | Description |
|-------------|-------------|
| 200 | Success - Request processed successfully |
| 400 | Validation error - Request parameters invalid |
| 408 | Rate limited - Timeout |
| 500 | Server error - Unexpected error occurred while processing request |
| 501 | Cover generation failed |
| 531 | Server error - Sorry, generation failed due to an issue. Your credits have been refunded. Please try again |

### msg (string, required)

Status message providing more detailed status description

### data.taskId (string, required)

Task ID, consistent with the taskId returned when you submitted the task

### data.images (array)

Array of generated cover image URLs, returned on success. Usually contains 2 different style cover images

## Callback Reception Examples

Here are example codes for receiving callbacks in common programming languages:

<Tabs>
  <TabItem value="nodejs" label="Node.js">
    ```javascript
    const express = require('express');
    const app = express();

    app.use(express.json());

    app.post('/suno-cover-callback', (req, res) => {
      const { code, msg, data } = req.body;
      
      console.log('Received cover generation callback:', {
        taskId: data.taskId,
        status: code,
        message: msg
      });
      
      if (code === 200) {
        // Task completed successfully
        console.log('Cover generation completed');
        const images = data.images;
        
        if (images && images.length > 0) {
          console.log('Generated cover images:');
          images.forEach((imageUrl, index) => {
            console.log(`Cover ${index + 1}: ${imageUrl}`);
          });
          
          // Process cover images
          // Can download images, save locally, update database, etc.
          downloadImages(images, data.taskId);
        }
        
      } else {
        // Task failed
        console.log('Cover generation failed:', msg);
        
        // Handle failure cases...
      }
      
      // Return 200 status code to confirm callback received
      res.status(200).json({ status: 'received' });
    });

    // Download images function
    async function downloadImages(imageUrls, taskId) {
      const fs = require('fs');
      const path = require('path');
      const https = require('https');
      
      // Create directory
      const dir = `covers/${taskId}`;
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      
      for (let i = 0; i < imageUrls.length; i++) {
        const url = imageUrls[i];
        const filename = path.join(dir, `cover_${i + 1}.png`);
        
        try {
          await downloadFile(url, filename);
          console.log(`Cover saved: ${filename}`);
        } catch (error) {
          console.error(`Download failed: ${error.message}`);
        }
      }
    }

    function downloadFile(url, filename) {
      return new Promise((resolve, reject) => {
        const file = fs.createWriteStream(filename);
        https.get(url, (response) => {
          response.pipe(file);
          file.on('finish', () => {
            file.close();
            resolve();
          });
        }).on('error', (err) => {
          fs.unlink(filename, () => {});
          reject(err);
        });
      });
    }

    app.listen(3000, () => {
      console.log('Callback server running on port 3000');
    });
    ```
  </TabItem>

  <TabItem value="python" label="Python">
    ```python
    from flask import Flask, request, jsonify
    import requests
    import os
    from urllib.parse import urlparse

    app = Flask(__name__)

    @app.route('/suno-cover-callback', methods=['POST'])
    def handle_callback():
        data = request.json
        
        code = data.get('code')
        msg = data.get('msg')
        callback_data = data.get('data', {})
        task_id = callback_data.get('taskId')
        images = callback_data.get('images')
        
        print(f"Received cover generation callback: {task_id}, status: {code}, message: {msg}")
        
        if code == 200:
            # Task completed successfully
            print("Cover generation completed")
            
            if images:
                print("Generated cover images:")
                for i, image_url in enumerate(images, 1):
                    print(f"Cover {i}: {image_url}")
                
                # Download cover images
                download_images(images, task_id)
                
        else:
            # Task failed
            print(f"Cover generation failed: {msg}")
            
            # Handle failure cases...
        
        # Return 200 status code to confirm callback received
        return jsonify({'status': 'received'}), 200

    def download_images(image_urls, task_id):
        """Download cover images"""
        # Create directory
        dir_path = f"covers/{task_id}"
        os.makedirs(dir_path, exist_ok=True)
        
        for i, url in enumerate(image_urls, 1):
            try:
                # Get file extension
                parsed_url = urlparse(url)
                file_ext = os.path.splitext(parsed_url.path)[1] or '.png'
                filename = os.path.join(dir_path, f"cover_{i}{file_ext}")
                
                # Download file
                response = requests.get(url, stream=True)
                if response.status_code == 200:
                    with open(filename, 'wb') as f:
                        for chunk in response.iter_content(chunk_size=8192):
                            f.write(chunk)
                    print(f"Cover saved: {filename}")
                else:
                    print(f"Download failed {url}: HTTP {response.status_code}")
                    
            except Exception as e:
                print(f"Download failed {url}: {e}")

    if __name__ == '__main__':
        app.run(host='0.0.0.0', port=3000)
    ```
  </TabItem>

  <TabItem value="java" label="Java">
    ```java
    @PostMapping("/suno-cover-callback")
    public ResponseEntity<Map<String, String>> handleCoverCallback(
        @RequestBody CoverCallbackRequest request) {
        
        log.info("Received cover generation callback: taskId={}, status={}, message={}", 
            request.getData().getTaskId(), request.getCode(), request.getMsg());
    
        try {
            if (request.getCode() == 200) {
                // Task completed successfully
                log.info("Cover generation completed");
                List<String> images = request.getData().getImages();
                
                if (images != null && !images.isEmpty()) {
                    log.info("Generated cover images: {}", images);
                    processCoverImages(request.getData().getTaskId(), images);
                }
                
            } else {
                // Task failed
                log.error("Cover generation failed: {}", request.getMsg());
                handleCoverGenerationFailure(request.getData().getTaskId(), 
                    request.getCode(), request.getMsg());
            }
            
            coverTaskService.updateTaskStatus(request.getData().getTaskId(), 
                request.getCode(), request.getMsg(), request.getData().getImages());
                
        } catch (Exception e) {
            log.error("Failed to process cover generation callback", e);
            return ResponseEntity.status(500)
                .body(Map.of("status", "error", "message", e.getMessage()));
        }
        
        return ResponseEntity.ok(Map.of("status", "received"));
    }

    private void processCoverImages(String taskId, List<String> imageUrls) {
        CompletableFuture.runAsync(() -> {
            try {
                downloadCoverImages(taskId, imageUrls);
            } catch (Exception e) {
                log.error("Failed to download cover images: taskId={}", taskId, e);
            }
        });
    }

    private void downloadCoverImages(String taskId, List<String> imageUrls) {
        String dirPath = "covers/" + taskId;
        File dir = new File(dirPath);
        if (!dir.exists()) {
            dir.mkdirs();
        }
        
        for (int i = 0; i < imageUrls.size(); i++) {
            String url = imageUrls.get(i);
            String filename = dirPath + "/cover_" + (i + 1) + ".png";
            
            try {
                downloadFile(url, filename);
                log.info("Cover saved: {}", filename);
            } catch (Exception e) {
                log.error("Download failed: {}", url, e);
            }
        }
    }

    @Data
    public class CoverCallbackRequest {
        private Integer code;
        private String msg;
        private CoverCallbackData data;
    }

    @Data
    public class CoverCallbackData {
        private String taskId;
        private List<String> images;
    }
    ```
  </TabItem>

  <TabItem value="php" label="PHP">
    ```php
    <?php
    header('Content-Type: application/json');

    // Get POST data
    $input = file_get_contents('php://input');
    $data = json_decode($input, true);

    $code = $data['code'] ?? null;
    $msg = $data['msg'] ?? '';
    $callbackData = $data['data'] ?? [];
    $taskId = $callbackData['taskId'] ?? '';
    $images = $callbackData['images'] ?? null;

    error_log("Received cover generation callback: $taskId, status: $code, message: $msg");

    if ($code === 200) {
        // Task completed successfully
        error_log("Cover generation completed");
        
        if ($images && is_array($images) && count($images) > 0) {
            error_log("Generated cover images: " . implode(', ', $images));
            downloadCoverImages($taskId, $images);
        }
        
    } else {
        // Task failed
        error_log("Cover generation failed: $msg");
    }

    function downloadCoverImages($taskId, $imageUrls) {
        $dir = "covers/$taskId";
        if (!is_dir($dir)) {
            mkdir($dir, 0777, true);
        }
        
        foreach ($imageUrls as $index => $url) {
            $filename = $dir . "/cover_" . ($index + 1) . ".png";
            
            try {
                $imageContent = file_get_contents($url);
                if ($imageContent !== false) {
                    file_put_contents($filename, $imageContent);
                    error_log("Cover saved: $filename");
                } else {
                    error_log("Download failed: $url");
                }
            } catch (Exception $e) {
                error_log("Download failed $url: " . $e->getMessage());
            }
        }
    }

    http_response_code(200);
    echo json_encode(['status' => 'received']);
    ?>
    ```
  </TabItem>
</Tabs>

## Best Practices

:::tip Callback URL Configuration Recommendations
1. **Use HTTPS**: Ensure callback URL uses HTTPS protocol for data transmission security
2. **Verify Source**: Verify the legitimacy of request sources in callback processing
3. **Idempotent Processing**: The same taskId may receive multiple callbacks, ensure processing logic is idempotent
4. **Quick Response**: Callback processing should return 200 status code quickly to avoid timeout
5. **Asynchronous Processing**: Complex business logic should be processed asynchronously to avoid blocking callback response
6. **Image Management**: Download and save images promptly, noting URL validity period
7. **Error Retry**: Implement retry mechanism for failed image downloads
:::

:::warning Important Reminders
- Callback URL must be a publicly accessible address
- Server must respond within 15 seconds, otherwise it will be considered timeout
- If 3 consecutive retries fail, the system will stop sending callbacks
- Please ensure stability of callback processing logic to avoid callback failures due to exceptions
- Cover image URLs may have validity periods, recommend downloading and saving promptly
- Usually generates 2 different style cover images for selection
- Note handling exceptions for failed image downloads
:::

## Troubleshooting

If you don't receive callback notifications, please check the following:

<details>
  <summary>Network Connection Issues</summary>

- Confirm callback URL is accessible from the public internet
- Check firewall settings to ensure inbound requests are not blocked
- Verify domain name resolution is correct
</details>

<details>
  <summary>Server Response Issues</summary>

- Ensure server returns HTTP 200 status code within 15 seconds
- Check server logs for error messages
- Verify interface path and HTTP method are correct
</details>

<details>
  <summary>Content Format Issues</summary>

- Confirm received POST request body is in JSON format
- Check if Content-Type is application/json
- Verify JSON parsing is correct
</details>

<details>
  <summary>Image Processing Issues</summary>

- Confirm image URLs are accessible
- Check image download permissions and network connection
- Verify file save path and permissions
- Note image URL validity period limitations
</details>

## Alternative Solutions

If you cannot use the callback mechanism, you can also use polling:

<Card
  title="Poll Query Results"
  icon="lucide-radar"
  href="/suno-api/get-music-details"
>
  Use the get music details endpoint to regularly query task status. We recommend querying every 30 seconds.
</Card>



# ========== replace-section-callbacks ==========

# Replace Music Section Callbacks

Understand the callback mechanism for replace music section tasks.

When you submit a replace music section task to the API, you can provide a `callBackUrl` to receive real-time notifications about task progress and completion.

## Callback Mechanism

:::tip Webhook Security
To ensure the authenticity and integrity of callback requests, we strongly recommend implementing webhook signature verification. See our [Webhook Verification Guide](/common-api/webhook-verification) for detailed implementation steps.
:::

### When Callbacks Are Sent

The system sends callbacks at the following times:
- **Complete**: When the replacement task is fully completed

### Callback Method

- **HTTP Method**: POST
- **Content-Type**: application/json
- **Timeout**: 10 seconds
- **Retry Policy**: Up to 3 attempts with exponential backoff

## Request Format

### Success Callback

When the replacement task completes successfully:

```json
{
  "code": 200,
  "msg": "All generated successfully.",
  "data": {
    "callbackType": "complete",
    "task_id": "2fac****9f72",
    "data": [
      {
        "id": "e231****-****-****-****-****8cadc7dc",
        "audio_url": "https://example.cn/****.mp3",
        "stream_audio_url": "https://example.cn/****",
        "image_url": "https://example.cn/****.jpeg",
        "prompt": "A calm and relaxing piano track.",
        "model_name": "chirp-v3-5",
        "title": "Relaxing Piano",
        "tags": "Jazz",
        "createTime": "2025-01-01 00:00:00",
        "duration": 198.44
      }
    ]
  }
}
```

### Failure Callback

When the replacement task fails:

```json
{
  "code": 501,
  "msg": "Audio generation failed.",
  "data": {
    "callbackType": "error",
    "task_id": "2fac****9f72",
    "error": "Generation failed due to technical issues"
  }
}
```

## Status Codes

| Code | Description |
|------|-------------|
| 200  | Success - Task completed successfully |
| 400  | Validation error - Parameter validation failed |
| 408  | Timeout - Request timeout |
| 500  | Server error - Unexpected error occurred |
| 501  | Audio generation failed |
| 531  | Server error - Generation failed, credits refunded |

## Response Fields

### Success Response Fields

**code** (integer, required) — Status code indicating the result of the replacement task

**msg** (string, required) — Status message describing the result

**data** (object, required) — Container for callback data

- **callbackType** (string, required) — Type of callback: `complete` or `error`
- **task_id** (string, required) — The task ID for the replacement request
- **data** (array) — Array of replaced music data (only present on success)
  - **id** (string) — Unique identifier for the music segment
  - **audio_url** (string) — Direct URL to the audio file
  - **stream_audio_url** (string) — Streaming URL for the audio
  - **image_url** (string) — URL to the cover image
  - **prompt** (string) — The prompt used for generating the replacement
  - **model_name** (string) — Name of the AI model used
  - **title** (string) — Title of the music
  - **tags** (string) — Style tags for the music
  - **createTime** (string) — Creation timestamp
  - **duration** (number) — Duration of the audio in seconds

## Implementation Examples

<Tabs>
  <TabItem value="nodejs" label="Node.js (Express)">
    ```javascript
    const express = require('express');
    const app = express();

    app.use(express.json());

    app.post('/replace-section-callback', (req, res) => {
      const { code, msg, data } = req.body;
      
      console.log('Replace section callback received:', {
        code,
        msg,
        taskId: data.task_id,
        callbackType: data.callbackType
      });
      
      if (code === 200 && data.callbackType === 'complete') {
        // Handle successful replacement
        console.log('Replacement completed successfully');
        data.data.forEach((music, index) => {
          console.log(`Music ${index + 1}:`, {
            id: music.id,
            title: music.title,
            duration: music.duration,
            audioUrl: music.audio_url
          });
        });
      } else {
        // Handle failure
        console.log('Replacement failed:', msg);
      }
      
      // Always respond with success to acknowledge receipt
      res.json({ code: 200, msg: 'success' });
    });

    app.listen(3000, () => {
      console.log('Callback server running on port 3000');
    });
    ```
  </TabItem>

  <TabItem value="python" label="Python (Flask)">
    ```python
    from flask import Flask, request, jsonify
    import logging

    app = Flask(__name__)
    logging.basicConfig(level=logging.INFO)

    @app.route('/replace-section-callback', methods=['POST'])
    def replace_section_callback():
        data = request.json
        code = data.get('code')
        msg = data.get('msg')
        callback_data = data.get('data', {})
        
        logging.info(f"Replace section callback received: code={code}, msg={msg}")
        
        if code == 200 and callback_data.get('callbackType') == 'complete':
            # Handle successful replacement
            logging.info("Replacement completed successfully")
            music_data = callback_data.get('data', [])
            for i, music in enumerate(music_data):
                logging.info(f"Music {i + 1}: {music.get('title')} - {music.get('duration')}s")
        else:
            # Handle failure
            logging.error(f"Replacement failed: {msg}")
        
        # Always respond with success
        return jsonify({"code": 200, "msg": "success"})

    if __name__ == '__main__':
        app.run(host='0.0.0.0', port=3000)
    ```
  </TabItem>

  <TabItem value="php" label="PHP">
    ```php
    <?php
    header('Content-Type: application/json');

    // Get the raw POST data
    $input = file_get_contents('php://input');
    $data = json_decode($input, true);

    if ($data === null) {
        http_response_code(400);
        echo json_encode(['code' => 400, 'msg' => 'Invalid JSON']);
        exit;
    }

    $code = $data['code'] ?? null;
    $msg = $data['msg'] ?? '';
    $callbackData = $data['data'] ?? [];

    error_log("Replace section callback received: code=$code, msg=$msg");

    if ($code === 200 && ($callbackData['callbackType'] ?? '') === 'complete') {
        // Handle successful replacement
        error_log("Replacement completed successfully");
        $musicData = $callbackData['data'] ?? [];
        foreach ($musicData as $index => $music) {
            $title = $music['title'] ?? 'Unknown';
            $duration = $music['duration'] ?? 0;
            error_log("Music " . ($index + 1) . ": $title - {$duration}s");
        }
    } else {
        // Handle failure
        error_log("Replacement failed: $msg");
    }

    // Always respond with success
    echo json_encode(['code' => 200, 'msg' => 'success']);
    ?>
    ```
  </TabItem>
</Tabs>

## Callback Security

### Verification Recommendations

1. **IP Whitelist**: Restrict callback endpoints to known IP addresses
2. **HTTPS Only**: Always use HTTPS for callback URLs in production
3. **Request Validation**: Validate the structure and content of callback requests
4. **Timeout Handling**: Implement proper timeout handling for callback processing

### Example Security Implementation

```javascript
const crypto = require('crypto');

function verifyCallback(req, res, next) {
  // Verify request structure
  const { code, msg, data } = req.body;
  if (typeof code !== 'number' || typeof msg !== 'string' || !data) {
    return res.status(400).json({ code: 400, msg: 'Invalid callback format' });
  }
  
  // Verify task ID format
  const taskId = data.task_id;
  if (!taskId || !/^[a-f0-9\*]{12}$/.test(taskId)) {
    return res.status(400).json({ code: 400, msg: 'Invalid task ID' });
  }
  
  next();
}

app.post('/replace-section-callback', verifyCallback, (req, res) => {
  // Process verified callback
  // ... callback handling logic
});
```

## Troubleshooting

### Common Issues

**Q: Callbacks are not being received**
- Verify your callback URL is publicly accessible
- Check that your server is responding within 10 seconds
- Ensure your endpoint accepts POST requests with JSON content

**Q: Receiving duplicate callbacks**
- This can happen due to network issues or timeouts
- Implement idempotency using the task_id to handle duplicates

**Q: Callback data is missing or incomplete**
- Check the `callbackType` field to understand the callback stage
- For error callbacks, check the error message for details

**Q: How to handle callback failures?**
- Always return a 200 status code to acknowledge receipt
- Use the [Get Music Details](/suno-api/get-music-details) endpoint to poll task status as a fallback

### Best Practices

1. **Always Acknowledge**: Return HTTP 200 even if your processing fails
2. **Implement Retry Logic**: Handle temporary failures gracefully
3. **Log Everything**: Keep detailed logs for debugging
4. **Use Fallback Polling**: Don't rely solely on callbacks for critical workflows
5. **Validate Data**: Always validate callback data before processing



# ========== generate-lyrics-callbacks ==========

# Lyrics Generation Callbacks

System will call this callback when lyrics generation is complete.

When you submit a lyrics generation task to the Suno API, you can use the `callBackUrl` parameter to set a callback URL. The system will automatically push the results to your specified address when the task is completed.

## Callback Mechanism Overview

:::info[]
The callback mechanism eliminates the need to poll the API for task status. The system will proactively push task completion results to your server.
:::

:::tip Webhook Security
To ensure the authenticity and integrity of callback requests, we strongly recommend implementing webhook signature verification. See our [Webhook Verification Guide](/common-api/webhook-verification) for detailed implementation steps.
:::

### Callback Timing

The system will send callback notifications in the following situations:
- Lyrics generation task completed successfully
- Lyrics generation task failed
- Errors occurred during task processing

### Callback Method

- **HTTP Method**: POST
- **Content Type**: application/json
- **Timeout Setting**: 15 seconds

## Callback Request Format

When the task is completed, the system will send a POST request to your `callBackUrl` in the following format:

<Tabs>
  <TabItem value="success" label="Success Callback">
    ```json
    {
      "code": 200,
      "msg": "All generated successfully.",
      "data": {
        "callbackType": "complete",
        "task_id": "3b66882fde0a5d398bd269cab6d9542b",
        "data": [
          {
            "error_message": "",
            "status": "complete",
            "text": "[Verse]\nMoonlight spreads across the windowsill\nStars dance, never standing still\nNight breeze weaves dreams with gentle skill\nLeaving all worries on the hill\n\n[Verse 2]\nLights reflect in your bright eyes\nLike meteors across the skies\nThe world stops in that moment's prize\nChasing future, no goodbyes\n\n[Chorus]\nIn starry dreams we find tomorrow\nBreak free from ordinary sorrow\nAll our dreams will bloom and follow\nDon't fear the path, don't fear tomorrow",
            "title": "Starry Night Dreams"
          }
        ]
      }
    }
    ```
  </TabItem>
  <TabItem value="failure" label="Failure Callback">
    ```json
    {
      "code": 400,
      "msg": "Song Description flagged for moderation",
      "data": {
        "callbackType": "complete",
        "task_id": "3b66882fde0a5d398bd269cab6d9542b",
        "data": null
      }
    }
    ```
  </TabItem>
</Tabs>

## Status Code Description

### code (integer, required)

Callback status code indicating task processing result:

| Status Code | Description |
|-------------|-------------|
| 200 | Success - Request has been processed successfully |
| 400 | Please try rephrasing with more specific details or using a different approach |
| 500 | Internal Error - Please try again later |

### msg (string, required)

Status message providing detailed status description

### data.callbackType (string, required)

Callback type, fixed as complete

### data.task_id (string, required)

Task ID, consistent with the task_id returned when you submitted the task

### data.data (array, required)

Generated lyrics list

### data.data[].text (string)

Lyrics content, returns complete lyrics text on success

### data.data[].title (string)

Lyrics title

### data.data[].status (string, required)

Generation status:
- **complete** - Generation successful
- **failed** - Generation failed

### data.data[].error_message (string)

Error message, valid when status is failed

## Callback Reception Examples

Here are example codes for receiving callbacks in popular programming languages:

<Tabs>
  <TabItem value="nodejs" label="Node.js">
    ```javascript
    const express = require('express');
    const app = express();

    app.use(express.json());

    app.post('/suno-lyrics-callback', (req, res) => {
      const { code, msg, data } = req.body;
      
      console.log('Received lyrics callback:', {
        taskId: data.task_id,
        status: code,
        message: msg,
        callbackType: data.callbackType
      });
      
      if (code === 200) {
        // Task completed successfully
        console.log('Lyrics generation completed:', data.data);
        
        // Process generated lyrics data
        data.data.forEach(lyrics => {
          if (lyrics.status === 'complete') {
            console.log(`Lyrics title: ${lyrics.title}`);
            console.log(`Lyrics content: ${lyrics.text}`);
          } else if (lyrics.status === 'failed') {
            console.log(`Lyrics generation failed: ${lyrics.error_message}`);
          }
        });
        
      } else {
        // Task failed
        console.log('Task failed:', msg);
        
        // Handle failure cases...
      }
      
      // Return 200 status code to confirm callback received
      res.status(200).json({ status: 'received' });
    });

    app.listen(3000, () => {
      console.log('Callback server running on port 3000');
    });
    ```
  </TabItem>

  <TabItem value="python" label="Python">
    ```python
    from flask import Flask, request, jsonify
    import json

    app = Flask(__name__)

    @app.route('/suno-lyrics-callback', methods=['POST'])
    def handle_callback():
        data = request.json
        
        code = data.get('code')
        msg = data.get('msg')
        callback_data = data.get('data', {})
        task_id = callback_data.get('task_id')
        callback_type = callback_data.get('callbackType')
        
        print(f"Received lyrics callback: {task_id}, status: {code}, type: {callback_type}, message: {msg}")
        
        if code == 200:
            # Task completed successfully
            lyrics_list = callback_data.get('data', [])
            print(f"Lyrics generation completed, generated {len(lyrics_list)} lyrics")
            
            for lyrics in lyrics_list:
                if lyrics['status'] == 'complete':
                    print(f"Lyrics title: {lyrics['title']}")
                    print(f"Lyrics content: {lyrics['text']}")
                elif lyrics['status'] == 'failed':
                    print(f"Lyrics generation failed: {lyrics['error_message']}")
                    
        else:
            # Task failed
            print(f"Task failed: {msg}")
            
            # Handle failure cases...
        
        # Return 200 status code to confirm callback received
        return jsonify({'status': 'received'}), 200

    if __name__ == '__main__':
        app.run(host='0.0.0.0', port=3000)
    ```
  </TabItem>

  <TabItem value="php" label="PHP">
    ```php
    <?php
    header('Content-Type: application/json');

    // Get POST data
    $input = file_get_contents('php://input');
    $data = json_decode($input, true);

    $code = $data['code'] ?? null;
    $msg = $data['msg'] ?? '';
    $callbackData = $data['data'] ?? [];
    $taskId = $callbackData['task_id'] ?? '';
    $callbackType = $callbackData['callbackType'] ?? '';

    error_log("Received lyrics callback: $taskId, status: $code, type: $callbackType, message: $msg");

    if ($code === 200) {
        // Task completed successfully
        $lyricsList = $callbackData['data'] ?? [];
        error_log("Lyrics generation completed, generated " . count($lyricsList) . " lyrics");
        
        foreach ($lyricsList as $lyrics) {
            if ($lyrics['status'] === 'complete') {
                error_log("Lyrics title: " . $lyrics['title']);
                error_log("Lyrics content: " . $lyrics['text']);
            } elseif ($lyrics['status'] === 'failed') {
                error_log("Lyrics generation failed: " . $lyrics['error_message']);
            }
        }
        
    } else {
        // Task failed
        error_log("Task failed: $msg");
        
        // Handle failure cases...
    }

    // Return 200 status code to confirm callback received
    http_response_code(200);
    echo json_encode(['status' => 'received']);
    ?>
    ```
  </TabItem>
</Tabs>

## Best Practices

:::tip Callback URL Configuration Recommendations
1. **Use HTTPS**: Ensure your callback URL uses HTTPS protocol for secure data transmission
2. **Verify Source**: Verify the legitimacy of the request source in callback processing
3. **Idempotent Processing**: The same task_id may receive multiple callbacks, ensure processing logic is idempotent
4. **Quick Response**: Callback processing should return a 200 status code as quickly as possible to avoid timeout
5. **Asynchronous Processing**: Complex business logic should be processed asynchronously to avoid blocking callback response
6. **Status Checking**: Check the status field of each lyrics item to distinguish between success and failure cases
:::

:::warning Important Reminders
- Callback URL must be a publicly accessible address
- Server must respond within 15 seconds, otherwise it will be considered a timeout
- If 3 consecutive retries fail, the system will stop sending callbacks
- Please ensure the stability of callback processing logic to avoid callback failures due to exceptions
- Pay attention to handling lyrics generation failure cases, check the error_message field for specific error information
:::

## Troubleshooting

If you do not receive callback notifications, please check the following:

<details>
  <summary>Network Connection Issues</summary>

- Confirm that the callback URL is accessible from the public network
- Check firewall settings to ensure inbound requests are not blocked
- Verify that domain name resolution is correct
</details>

<details>
  <summary>Server Response Issues</summary>

- Ensure the server returns HTTP 200 status code within 15 seconds
- Check server logs for error messages
- Verify that the interface path and HTTP method are correct
</details>

<details>
  <summary>Content Format Issues</summary>

- Confirm that the received POST request body is in JSON format
- Check that Content-Type is application/json
- Verify that JSON parsing is correct
</details>

<details>
  <summary>Lyrics Processing Issues</summary>

- Confirm proper handling of lyrics status field
- Check if processing of failed status lyrics is missed
- Verify that lyrics content parsing is correct
</details>

## Alternative Solution

If you cannot use the callback mechanism, you can also use polling:

<Card
  title="Poll Query Results"
  icon="lucide-radar"
  href="/suno-api/get-lyrics-details"
>
 Use the get lyrics details endpoint to regularly query task status. We recommend querying every 30 seconds.
</Card>


# ========== convert-to-wav-callbacks ==========

# Convert to WAV Callbacks

System will call this callback when WAV format audio generation is complete.

When you submit a WAV format conversion task to the Suno API, you can use the `callBackUrl` parameter to set a callback URL. The system will automatically push the results to your specified address when the task is completed.

## Callback Mechanism Overview

:::info[]
The callback mechanism eliminates the need to poll the API for task status. The system will proactively push task completion results to your server.
:::

:::tip Webhook Security
To ensure the authenticity and integrity of callback requests, we strongly recommend implementing webhook signature verification. See our [Webhook Verification Guide](/common-api/webhook-verification) for detailed implementation steps.
:::

### Callback Timing

The system will send callback notifications in the following situations:
- WAV format conversion task completed successfully
- WAV format conversion task failed
- Errors occurred during task processing

### Callback Method

- **HTTP Method**: POST
- **Content Type**: application/json
- **Timeout Setting**: 15 seconds

## Callback Request Format

When the task is completed, the system will send a POST request to your `callBackUrl` in the following format:

<Tabs>
  <TabItem value="success" label="Success Callback">
    ```json
    {
      "code": 200,
      "msg": "success",
      "data": {
        "audioWavUrl": "https://example.com/s/04e6****e727.wav",
        "task_id": "988e****c8d3"
      }
    }
    ```
  </TabItem>
  <TabItem value="failure" label="Failure Callback">
    ```json
    {
      "code": 500,
      "msg": "Internal Error - Please try again later",
      "data": {
        "audioWavUrl": null,
        "task_id": "988e****c8d3"
      }
    }
    ```
  </TabItem>
</Tabs>

## Status Code Description

### code (integer, required)

Callback status code indicating task processing result:

| Status Code | Description |
|-------------|-------------|
| 200 | Success - Request has been processed successfully |
| 500 | Internal Error - Please try again later |

### msg (string, required)

Status message providing detailed status description

### data.task_id (string, required)

Task ID, consistent with the task_id returned when you submitted the task

### data.audioWavUrl (string)

WAV format audio file URL, returned on success with accessible download link

## Callback Reception Examples

Here are example codes for receiving callbacks in popular programming languages:

<Tabs>
  <TabItem value="nodejs" label="Node.js">
    ```javascript
    const express = require('express');
    const app = express();

    app.use(express.json());

    app.post('/suno-wav-callback', (req, res) => {
      const { code, msg, data } = req.body;
      
      console.log('Received WAV conversion callback:', {
        taskId: data.task_id,
        status: code,
        message: msg
      });
      
      if (code === 200) {
        // Task completed successfully
        console.log('WAV conversion completed');
        console.log(`WAV file URL: ${data.audioWavUrl}`);
        
        // Process generated WAV file
        // Can download file, save locally, etc.
        
      } else {
        // Task failed
        console.log('WAV conversion failed:', msg);
        
        // Handle failure cases...
      }
      
      // Return 200 status code to confirm callback received
      res.status(200).json({ status: 'received' });
    });

    app.listen(3000, () => {
      console.log('Callback server running on port 3000');
    });
    ```
  </TabItem>

  <TabItem value="python" label="Python">
    ```python
    from flask import Flask, request, jsonify
    import requests

    app = Flask(__name__)

    @app.route('/suno-wav-callback', methods=['POST'])
    def handle_callback():
        data = request.json
        
        code = data.get('code')
        msg = data.get('msg')
        callback_data = data.get('data', {})
        task_id = callback_data.get('task_id')
        audio_wav_url = callback_data.get('audioWavUrl')
        
        print(f"Received WAV conversion callback: {task_id}, status: {code}, message: {msg}")
        
        if code == 200:
            # Task completed successfully
            print("WAV conversion completed")
            print(f"WAV file URL: {audio_wav_url}")
            
            # Process generated WAV file
            # Can download file, save locally, etc.
            if audio_wav_url:
                try:
                    # Download WAV file example
                    response = requests.get(audio_wav_url)
                    if response.status_code == 200:
                        with open(f"wav_file_{task_id}.wav", "wb") as f:
                            f.write(response.content)
                        print(f"WAV file saved as wav_file_{task_id}.wav")
                except Exception as e:
                    print(f"WAV file download failed: {e}")
                    
        else:
            # Task failed
            print(f"WAV conversion failed: {msg}")
            
            # Handle failure cases...
        
        # Return 200 status code to confirm callback received
        return jsonify({'status': 'received'}), 200

    if __name__ == '__main__':
        app.run(host='0.0.0.0', port=3000)
    ```
  </TabItem>

  <TabItem value="php" label="PHP">
    ```php
    <?php
    header('Content-Type: application/json');

    // Get POST data
    $input = file_get_contents('php://input');
    $data = json_decode($input, true);

    $code = $data['code'] ?? null;
    $msg = $data['msg'] ?? '';
    $callbackData = $data['data'] ?? [];
    $taskId = $callbackData['task_id'] ?? '';
    $audioWavUrl = $callbackData['audioWavUrl'] ?? '';

    error_log("Received WAV conversion callback: $taskId, status: $code, message: $msg");

    if ($code === 200) {
        // Task completed successfully
        error_log("WAV conversion completed");
        error_log("WAV file URL: $audioWavUrl");
        
        // Process generated WAV file
        if (!empty($audioWavUrl)) {
            try {
                // Download WAV file example
                $wavContent = file_get_contents($audioWavUrl);
                if ($wavContent !== false) {
                    $filename = "wav_file_{$taskId}.wav";
                    file_put_contents($filename, $wavContent);
                    error_log("WAV file saved as $filename");
                }
            } catch (Exception $e) {
                error_log("WAV file download failed: " . $e->getMessage());
            }
        }
        
    } else {
        // Task failed
        error_log("WAV conversion failed: $msg");
        
        // Handle failure cases...
    }

    // Return 200 status code to confirm callback received
    http_response_code(200);
    echo json_encode(['status' => 'received']);
    ?>
    ```
  </TabItem>
</Tabs>

## Best Practices

:::tip Callback URL Configuration Recommendations
1. **Use HTTPS**: Ensure your callback URL uses HTTPS protocol for secure data transmission
2. **Verify Source**: Verify the legitimacy of the request source in callback processing
3. **Idempotent Processing**: The same task_id may receive multiple callbacks, ensure processing logic is idempotent
4. **Quick Response**: Callback processing should return a 200 status code as quickly as possible to avoid timeout
5. **Asynchronous Processing**: Complex business logic should be processed asynchronously to avoid blocking callback response
6. **File Processing**: WAV file download and processing should be done in asynchronous tasks to avoid blocking callback response
:::

:::warning Important Reminders
- Callback URL must be a publicly accessible address
- Server must respond within 15 seconds, otherwise it will be considered a timeout
- If 3 consecutive retries fail, the system will stop sending callbacks
- Please ensure the stability of callback processing logic to avoid callback failures due to exceptions
- WAV file URLs may have time limits, recommend downloading and saving promptly
:::

## Troubleshooting

If you do not receive callback notifications, please check the following:

<details>
  <summary>Network Connection Issues</summary>

- Confirm that the callback URL is accessible from the public network
- Check firewall settings to ensure inbound requests are not blocked
- Verify that domain name resolution is correct
</details>

<details>
  <summary>Server Response Issues</summary>

- Ensure the server returns HTTP 200 status code within 15 seconds
- Check server logs for error messages
- Verify that the interface path and HTTP method are correct
</details>

<details>
  <summary>Content Format Issues</summary>

- Confirm that the received POST request body is in JSON format
- Check that Content-Type is application/json
- Verify that JSON parsing is correct
</details>

<details>
  <summary>File Processing Issues</summary>

- Confirm that the WAV file URL is accessible
- Check file download permissions and network connections
- Verify file save paths and permissions
</details>

## Alternative Solution

If you cannot use the callback mechanism, you can also use polling:

<Card
  title="Poll Query Results"
  icon="lucide-radar"
  href="/suno-api/get-wav-details"
>
  Use the get WAV details endpoint to regularly query task status. We recommend querying every 30 seconds.
</Card>



# ========== separate-vocals-callbacks ==========

# Audio Separation Callbacks

System will call this callback when vocal and instrument separation is complete.

When you submit a vocal separation task to the Suno API, you can use the `callBackUrl` parameter to set a callback URL. The system will automatically push the results to your specified address when the task is completed.

## Callback Mechanism Overview

:::info[]
The callback mechanism eliminates the need to poll the API for task status. The system will proactively push task completion results to your server.
:::

:::tip Webhook Security
To ensure the authenticity and integrity of callback requests, we strongly recommend implementing webhook signature verification. See our [Webhook Verification Guide](/common-api/webhook-verification) for detailed implementation steps.
:::

### Callback Timing

The system will send callback notifications in the following situations:
- Vocal separation task completed successfully
- Vocal separation task failed
- Errors occurred during task processing

### Callback Method

- **HTTP Method**: POST
- **Content Type**: application/json
- **Timeout Setting**: 15 seconds

## Callback Request Format

When the task is completed, the system will send a POST request to your `callBackUrl` based on the separation type you selected. Different separation types correspond to different callback data structures:

### separate_vocal Type Callbacks

<Tabs>
  <TabItem value="separate_vocal_success" label="Success Callback">
    ```json
    {
      "code": 200,
      "msg": "vocal separation generated successfully.",
      "data": {
        "task_id": "3e63b4cc88d52611159371f6af5571e7",
        "vocal_separation_info": {
          "instrumental_url": "https://file.aiquickdraw.com/s/d92a13bf-c6f4-4ade-bb47-f69738435528_Instrumental.mp3",
          "origin_url": "",
          "vocal_url": "https://file.aiquickdraw.com/s/3d7021c9-fa8b-4eda-91d1-3b9297ddb172_Vocals.mp3"
        }
      }
    }
    ```
  </TabItem>
  <TabItem value="separate_vocal_failure" label="Failure Callback">
    ```json
    {
      "code": 500,
      "msg": "Vocal separation failed",
      "data": {
        "task_id": "3e63b4cc88d52611159371f6af5571e7",
        "vocal_separation_info": null
      }
    }
    ```
  </TabItem>
</Tabs>

### split_stem Type Callbacks

<Tabs>
  <TabItem value="split_stem_success" label="Success Callback">
    ```json
    {
      "code": 200,
      "msg": "vocal separation generated successfully.",
      "data": {
        "task_id": "e649edb7abfd759285bd41a47a634b10",
        "vocal_separation_info": {
          "origin_url": "",
          "backing_vocals_url": "https://file.aiquickdraw.com/s/aadc51a3-4c88-4c8e-a4c8-e867c539673d_Backing_Vocals.mp3",
          "bass_url": "https://file.aiquickdraw.com/s/a3c2da5a-b364-4422-adb5-2692b9c26d33_Bass.mp3",
          "brass_url": "https://file.aiquickdraw.com/s/334b2d23-0c65-4a04-92c7-22f828afdd44_Brass.mp3",
          "drums_url": "https://file.aiquickdraw.com/s/ac75c5ea-ac77-4ad2-b7d9-66e140b78e44_Drums.mp3",
          "fx_url": "https://file.aiquickdraw.com/s/a8822c73-6629-4089-8f2a-d19f41f0007d_FX.mp3",
          "guitar_url": "https://file.aiquickdraw.com/s/064dd08e-d5d2-4201-9058-c5c40fb695b4_Guitar.mp3",
          "keyboard_url": "https://file.aiquickdraw.com/s/adc934e0-df7d-45da-8220-1dba160d74e0_Keyboard.mp3",
          "percussion_url": "https://file.aiquickdraw.com/s/0f70884d-047c-41f1-a6d0-7044618b7dc6_Percussion.mp3",
          "strings_url": "https://file.aiquickdraw.com/s/49829425-a5b0-424e-857a-75d4c63a426b_Strings.mp3",
          "synth_url": "https://file.aiquickdraw.com/s/56b2d94a-eb92-4d21-bc43-3460de0c8348_Synth.mp3",
          "vocal_url": "https://file.aiquickdraw.com/s/07420749-29a2-4054-9b62-e6a6f8b90ccb_Vocals.mp3",
          "woodwinds_url": "https://file.aiquickdraw.com/s/d81545b1-6f94-4388-9785-1aaa6ecabb02_Woodwinds.mp3"
        }
      }
    }
    ```
  </TabItem>
  <TabItem value="split_stem_failure" label="Failure Callback">
    ```json
    {
      "code": 500,
      "msg": "Instrument separation failed",
      "data": {
        "task_id": "e649edb7abfd759285bd41a47a634b10",
        "vocal_separation_info": null
      }
    }
    ```
  </TabItem>
</Tabs>

## Status Code Description

### code (integer, required)

Callback status code indicating task processing result:

| Status Code | Description |
|-------------|-------------|
| 200 | Success - Request has been processed successfully |
| 500 | Internal Error - Please try again later |

### msg (string, required)

Status message providing detailed status description

### data.task_id (string, required)

Task ID, consistent with the task_id returned when you submitted the task

### data.vocal_separation_info (object)

Vocal separation result information, returned on success. The returned fields depend on the separation type (type parameter)

## separate_vocal Type Callback Fields

### data.vocal_separation_info.instrumental_url (string)

Instrumental part audio URL (separate_vocal type only)

### data.vocal_separation_info.origin_url (string)

Original audio URL

### data.vocal_separation_info.vocal_url (string)

Vocal part audio URL

## split_stem Type Callback Fields

### data.vocal_separation_info.origin_url (string)

Original audio URL

### data.vocal_separation_info.vocal_url (string)

Main vocal audio URL

### data.vocal_separation_info.backing_vocals_url (string)

Backing vocals audio URL (split_stem type only)

### data.vocal_separation_info.drums_url (string)

Drums part audio URL (split_stem type only)

### data.vocal_separation_info.bass_url (string)

Bass part audio URL (split_stem type only)

### data.vocal_separation_info.guitar_url (string)

Guitar part audio URL (split_stem type only)

### data.vocal_separation_info.keyboard_url (string)

Keyboard part audio URL (split_stem type only)

### data.vocal_separation_info.percussion_url (string)

Percussion part audio URL (split_stem type only)

### data.vocal_separation_info.strings_url (string)

Strings part audio URL (split_stem type only)

### data.vocal_separation_info.synth_url (string)

Synthesizer part audio URL (split_stem type only)

### data.vocal_separation_info.fx_url (string)

Effects part audio URL (split_stem type only)

### data.vocal_separation_info.brass_url (string)

Brass part audio URL (split_stem type only)

### data.vocal_separation_info.woodwinds_url (string)

Woodwinds part audio URL (split_stem type only)

## Callback Reception Examples

Below are example codes for receiving callbacks in popular programming languages:

<Tabs>
  <TabItem value="nodejs" label="Node.js">
    ```javascript
    const express = require('express');
    const app = express();

    app.use(express.json());

    app.post('/suno-vocal-separation-callback', (req, res) => {
      const { code, msg, data } = req.body;
      
      console.log('Received vocal separation callback:', {
        taskId: data.task_id,
        status: code,
        message: msg
      });
      
      if (code === 200) {
        // Task completed successfully
        console.log('Vocal separation completed');
        const vocalInfo = data.vocal_separation_info;
        
        if (vocalInfo) {
          console.log('Separation results:');
          console.log(`Original audio: ${vocalInfo.origin_url}`);
          console.log(`Vocal part: ${vocalInfo.vocal_url}`);
          
          if (vocalInfo.instrumental_url) {
            console.log(`Instrumental part: ${vocalInfo.instrumental_url}`);
          }
          
          if (vocalInfo.backing_vocals_url) {
            console.log(`Backing vocals: ${vocalInfo.backing_vocals_url}`);
            console.log(`Drums part: ${vocalInfo.drums_url}`);
            console.log(`Bass part: ${vocalInfo.bass_url}`);
            console.log(`Guitar part: ${vocalInfo.guitar_url}`);
            console.log(`Keyboard part: ${vocalInfo.keyboard_url}`);
            console.log(`Percussion part: ${vocalInfo.percussion_url}`);
            console.log(`Strings part: ${vocalInfo.strings_url}`);
            console.log(`Synthesizer part: ${vocalInfo.synth_url}`);
            console.log(`Effects part: ${vocalInfo.fx_url}`);
            console.log(`Brass part: ${vocalInfo.brass_url}`);
            console.log(`Woodwinds part: ${vocalInfo.woodwinds_url}`);
          }
        }
        
      } else {
        console.log('Vocal separation failed:', msg);
      }
      
      res.status(200).json({ status: 'received' });
    });

    app.listen(3000, () => {
      console.log('Callback server running on port 3000');
    });
    ```
  </TabItem>

  <TabItem value="python" label="Python">
    ```python
    from flask import Flask, request, jsonify
    import requests
    import os

    app = Flask(__name__)

    @app.route('/suno-vocal-separation-callback', methods=['POST'])
    def handle_callback():
        data = request.json
        
        code = data.get('code')
        msg = data.get('msg')
        callback_data = data.get('data', {})
        task_id = callback_data.get('task_id')
        vocal_info = callback_data.get('vocal_separation_info')
        
        print(f"Received vocal separation callback: {task_id}, status: {code}, message: {msg}")
        
        if code == 200:
            print("Vocal separation completed")
            
            if vocal_info:
                print("Separation results:")
                print(f"Original audio: {vocal_info.get('origin_url')}")
                print(f"Vocal part: {vocal_info.get('vocal_url')}")
                
                if vocal_info.get('instrumental_url'):
                    print(f"Instrumental part: {vocal_info.get('instrumental_url')}")
                
                if vocal_info.get('backing_vocals_url'):
                    print(f"Backing vocals: {vocal_info.get('backing_vocals_url')}")
                    print(f"Drums part: {vocal_info.get('drums_url')}")
                    print(f"Bass part: {vocal_info.get('bass_url')}")
                    print(f"Guitar part: {vocal_info.get('guitar_url')}")
                    print(f"Keyboard part: {vocal_info.get('keyboard_url')}")
                    print(f"Percussion part: {vocal_info.get('percussion_url')}")
                    print(f"Strings part: {vocal_info.get('strings_url')}")
                    print(f"Synthesizer part: {vocal_info.get('synth_url')}")
                    print(f"Effects part: {vocal_info.get('fx_url')}")
                    print(f"Brass part: {vocal_info.get('brass_url')}")
                    print(f"Woodwinds part: {vocal_info.get('woodwinds_url')}")
                
                # Download example
                def download_audio_file(url, filename):
                    if url:
                        try:
                            response = requests.get(url)
                            if response.status_code == 200:
                                with open(filename, "wb") as f:
                                    f.write(response.content)
                                print(f"Saved: {filename}")
                        except Exception as e:
                            print(f"Download failed {filename}: {e}")
                
                os.makedirs(f"vocal_separation_{task_id}", exist_ok=True)
                download_audio_file(vocal_info.get('vocal_url'), 
                                  f"vocal_separation_{task_id}/vocal.mp3")
                
                if vocal_info.get('instrumental_url'):
                    download_audio_file(vocal_info.get('instrumental_url'), 
                                      f"vocal_separation_{task_id}/instrumental.mp3")
                
                if vocal_info.get('backing_vocals_url'):
                    stem_files = {
                        'backing_vocals': vocal_info.get('backing_vocals_url'),
                        'drums': vocal_info.get('drums_url'),
                        'bass': vocal_info.get('bass_url'),
                        'guitar': vocal_info.get('guitar_url'),
                        'keyboard': vocal_info.get('keyboard_url'),
                        'percussion': vocal_info.get('percussion_url'),
                        'strings': vocal_info.get('strings_url'),
                        'synth': vocal_info.get('synth_url'),
                        'fx': vocal_info.get('fx_url'),
                        'brass': vocal_info.get('brass_url'),
                        'woodwinds': vocal_info.get('woodwinds_url')
                    }
                    for name, url in stem_files.items():
                        download_audio_file(url, f"vocal_separation_{task_id}/{name}.mp3")
                
        else:
            print(f"Vocal separation failed: {msg}")
        
        return jsonify({'status': 'received'}), 200

    if __name__ == '__main__':
        app.run(host='0.0.0.0', port=3000)
    ```
  </TabItem>

  <TabItem value="php" label="PHP">
    ```php
    <?php
    header('Content-Type: application/json');

    $input = file_get_contents('php://input');
    $data = json_decode($input, true);

    $code = $data['code'] ?? null;
    $msg = $data['msg'] ?? '';
    $callbackData = $data['data'] ?? [];
    $taskId = $callbackData['task_id'] ?? '';
    $vocalInfo = $callbackData['vocal_separation_info'] ?? null;

    error_log("Received vocal separation callback: $taskId, status: $code, message: $msg");

    if ($code === 200) {
        error_log("Vocal separation completed");
        
        if ($vocalInfo) {
            error_log("Separation results:");
            error_log("Original audio: " . ($vocalInfo['origin_url'] ?? ''));
            error_log("Vocal part: " . ($vocalInfo['vocal_url'] ?? ''));
            
            if (!empty($vocalInfo['instrumental_url'])) {
                error_log("Instrumental part: " . $vocalInfo['instrumental_url']);
            }
            
            if (!empty($vocalInfo['backing_vocals_url'])) {
                error_log("Backing vocals: " . $vocalInfo['backing_vocals_url']);
                error_log("Drums part: " . ($vocalInfo['drums_url'] ?? ''));
                error_log("Bass part: " . ($vocalInfo['bass_url'] ?? ''));
                error_log("Guitar part: " . ($vocalInfo['guitar_url'] ?? ''));
                error_log("Keyboard part: " . ($vocalInfo['keyboard_url'] ?? ''));
                error_log("Percussion part: " . ($vocalInfo['percussion_url'] ?? ''));
                error_log("Strings part: " . ($vocalInfo['strings_url'] ?? ''));
                error_log("Synthesizer part: " . ($vocalInfo['synth_url'] ?? ''));
                error_log("Effects part: " . ($vocalInfo['fx_url'] ?? ''));
                error_log("Brass part: " . ($vocalInfo['brass_url'] ?? ''));
                error_log("Woodwinds part: " . ($vocalInfo['woodwinds_url'] ?? ''));
            }
            
            function downloadAudioFile($url, $filename) {
                if (!empty($url)) {
                    try {
                        $audioContent = file_get_contents($url);
                        if ($audioContent !== false) {
                            file_put_contents($filename, $audioContent);
                            error_log("Saved: $filename");
                        }
                    } catch (Exception $e) {
                        error_log("Download failed $filename: " . $e->getMessage());
                    }
                }
            }
            
            $dir = "vocal_separation_$taskId";
            if (!is_dir($dir)) {
                mkdir($dir, 0777, true);
            }
            
            downloadAudioFile($vocalInfo['vocal_url'] ?? '', "$dir/vocal.mp3");
            
            if (!empty($vocalInfo['instrumental_url'])) {
                downloadAudioFile($vocalInfo['instrumental_url'], "$dir/instrumental.mp3");
            }
            
            if (!empty($vocalInfo['backing_vocals_url'])) {
                $stemFiles = [
                    'backing_vocals' => $vocalInfo['backing_vocals_url'] ?? '',
                    'drums' => $vocalInfo['drums_url'] ?? '',
                    'bass' => $vocalInfo['bass_url'] ?? '',
                    'guitar' => $vocalInfo['guitar_url'] ?? '',
                    'keyboard' => $vocalInfo['keyboard_url'] ?? '',
                    'percussion' => $vocalInfo['percussion_url'] ?? '',
                    'strings' => $vocalInfo['strings_url'] ?? '',
                    'synth' => $vocalInfo['synth_url'] ?? '',
                    'fx' => $vocalInfo['fx_url'] ?? '',
                    'brass' => $vocalInfo['brass_url'] ?? '',
                    'woodwinds' => $vocalInfo['woodwinds_url'] ?? ''
                ];
                foreach ($stemFiles as $name => $url) {
                    downloadAudioFile($url, "$dir/$name.mp3");
                }
            }
        }
        
    } else {
        error_log("Vocal separation failed: $msg");
    }

    http_response_code(200);
    echo json_encode(['status' => 'received']);
    ?>
    ```
  </TabItem>
</Tabs>

## Best Practices

:::tip Callback URL Configuration Recommendations
1. **Use HTTPS**: Ensure callback URL uses HTTPS protocol for secure data transmission
2. **Verify Origin**: Verify the legitimacy of the request source in callback processing
3. **Idempotent Processing**: The same task_id may receive multiple callbacks, ensure processing logic is idempotent
4. **Quick Response**: Callback processing should return 200 status code quickly to avoid timeout
5. **Asynchronous Processing**: Complex business logic should be processed asynchronously to avoid blocking callback responses
6. **Type-based Processing**: Handle different audio file structures based on different separation types
7. **Batch Download**: split_stem type produces multiple files, recommend batch downloading and organizing by type
:::

:::warning Important Reminders
- Callback URL must be publicly accessible
- Server must respond within 15 seconds, otherwise will be considered timeout
- If 3 consecutive retry attempts fail, the system will stop sending callbacks
- Please ensure the stability of callback processing logic to avoid callback failures due to exceptions
- Vocal separation generated audio file URLs may have time limits, recommend downloading and saving promptly
- Note that some audio part URLs may be empty, certain instrument separations might be empty
- separate_vocal and split_stem types return different fields, please handle corresponding fields based on the type parameter in the request
:::

## Troubleshooting

If you are not receiving callback notifications, please check the following:

<details>
  <summary>Network Connection Issues</summary>

- Confirm callback URL is accessible from public internet
- Check firewall settings to ensure inbound requests are not blocked
- Verify domain name resolution is correct
</details>

<details>
  <summary>Server Response Issues</summary>

- Ensure server returns HTTP 200 status code within 15 seconds
- Check server logs for error messages
- Verify endpoint path and HTTP method are correct
</details>

<details>
  <summary>Content Format Issues</summary>

- Confirm received POST request body is in JSON format
- Check if Content-Type is application/json
- Verify JSON parsing is correct
</details>

<details>
  <summary>File Processing Issues</summary>

- Confirm all audio file URLs are accessible
- Check file download permissions and network connection
- Verify file save path and permissions
- Note that some instrument separation results may be empty
- Note the field differences between separate_vocal and split_stem types
</details>

## Alternative Solutions

If you cannot use the callback mechanism, you can also use polling:

<Card
  title="Poll Query Results"
  icon="lucide-radar"
  href="/suno-api/get-vocal-separation-details"
>
 Use the Get Vocal Separation Details endpoint to periodically query task status. We recommend querying every 30 seconds.
</Card>



# ========== generate-midi-callbacks ==========

# MIDI Generation Callbacks

System will call this callback when MIDI generation from separated audio is complete.

When you submit a MIDI generation task to the Suno API, you can use the `callBackUrl` parameter to set a callback URL. The system will automatically push the results to your specified address when the task is completed.

## Callback Mechanism Overview

:::info[]
The callback mechanism eliminates the need to poll the API for task status. The system will proactively push task completion results to your server.
:::

:::tip Webhook Security
To ensure the authenticity and integrity of callback requests, we strongly recommend implementing webhook signature verification. See our [Webhook Verification Guide](/common-api/webhook-verification) for detailed implementation steps.
:::

### Callback Timing

The system will send callback notifications in the following situations:
- MIDI generation task completed successfully
- MIDI generation task failed
- Errors occurred during task processing

### Callback Method

- **HTTP Method**: POST
- **Content Type**: application/json
- **Timeout Setting**: 15 seconds

## Callback Request Format

When the task is completed, the system will send a POST request to your `callBackUrl`:

<Tabs>
  <TabItem value="success" label="Success Callback">
    ```json
    {
      "code": 200,
      "msg": "success",
      "data": {
        "taskId": "5c79****be8e",
        "state": "complete",
        "instruments": [
          {
            "name": "Drums",
            "notes": [
              {
                "pitch": 73,
                "start": "0.036458333333333336",
                "end": "0.18229166666666666",
                "velocity": 1
              },
              {
                "pitch": 61,
                "start": 0.046875,
                "end": "0.19270833333333334",
                "velocity": 1
              },
              {
                "pitch": 73,
                "start": 0.1875,
                "end": "0.4895833333333333",
                "velocity": 1
              }
            ]
          },
          {
            "name": "Electric Bass (finger)",
            "notes": [
              {
                "pitch": 44,
                "start": 7.6875,
                "end": "7.911458333333333",
                "velocity": 1
              },
              {
                "pitch": 56,
                "start": 7.6875,
                "end": "7.911458333333333",
                "velocity": 1
              },
              {
                "pitch": 51,
                "start": 7.6875,
                "end": "7.911458333333333",
                "velocity": 1
              }
            ]
          }
        ]
      }
    }
    ```
  </TabItem>
  <TabItem value="failure" label="Failure Callback">
    ```json
    {
      "code": 500,
      "msg": "MIDI generation failed",
      "data": {
        "taskId": "5c79****be8e"
      }
    }
    ```
  </TabItem>
</Tabs>

## Status Code Description

### code (integer, required)

Callback status code indicating task processing result:

| Status Code | Description |
|-------------|-------------|
| 200 | Success - MIDI generation completed successfully |
| 500 | Internal Error - Please try again or contact support |

### msg (string, required)

Status message providing detailed status description

### taskId (string, required)

Task ID, consistent with the taskId returned when you submitted the task

### data (object)

MIDI generation result information, returned on success

## Success Response Fields

### data.state (string)

Processing state. Value: `complete` when successful

### data.instruments (array)

Array of detected instruments with their MIDI note data

**Instrument Object Properties:**
- **name** (string) — Instrument name (e.g., "Drums", "Electric Bass (finger)", "Acoustic Grand Piano")
- **notes** (array) — Array of MIDI notes for this instrument

**Note Object Properties:**
- **pitch** (integer) — MIDI note number (0-127). Middle C = 60. [MIDI note reference](https://inspiredacoustics.com/en/MIDI_note_numbers_and_center_frequencies)
- **start** (number | string) — Note start time in seconds from beginning of audio
- **end** (number | string) — Note end time in seconds from beginning of audio
- **velocity** (number) — Note velocity/intensity (0-1 range). 1 = maximum velocity

## Callback Reception Examples

Below are example codes for receiving callbacks in popular programming languages:

<Tabs>
  <TabItem value="nodejs" label="Node.js">
    ```javascript
    const express = require('express');
    const app = express();

    app.use(express.json());

    app.post('/suno-midi-callback', (req, res) => {
      const { code, msg, taskId, data } = req.body;
      
      console.log('Received MIDI generation callback:', {
        taskId: taskId,
        status: code,
        message: msg
      });
      
      if (code === 200) {
        // Task completed successfully
        console.log('MIDI generation completed');
        
        if (data && data.instruments) {
          console.log(`Detected ${data.instruments.length} instruments`);
          
          data.instruments.forEach(instrument => {
            console.log(`\nInstrument: ${instrument.name}`);
            console.log(`  Note count: ${instrument.notes.length}`);
            
            instrument.notes.forEach((note, idx) => {
              if (idx < 3) {
                console.log(`  Note ${idx + 1}: Pitch ${note.pitch}, ` +
                           `Start ${note.start}s, End ${note.end}s, ` +
                           `Velocity ${note.velocity}`);
              }
            });
          });
          
          // processMidiData(taskId, data);
        }
        
      } else {
        console.log('MIDI generation failed:', msg);
      }
      
      res.status(200).json({ status: 'received' });
    });

    app.listen(3000, () => {
      console.log('Callback server running on port 3000');
    });
    ```
  </TabItem>

  <TabItem value="python" label="Python">
    ```python
    from flask import Flask, request, jsonify
    import json

    app = Flask(__name__)

    @app.route('/suno-midi-callback', methods=['POST'])
    def handle_callback():
        data = request.json
        
        code = data.get('code')
        msg = data.get('msg')
        task_id = data.get('taskId')
        callback_data = data.get('data', {})
        
        print(f"Received MIDI generation callback: {task_id}, status: {code}, message: {msg}")
        
        if code == 200:
            print("MIDI generation completed")
            
            if callback_data and 'instruments' in callback_data:
                instruments = callback_data['instruments']
                print(f"Detected {len(instruments)} instruments")
                
                for instrument in instruments:
                    name = instrument.get('name')
                    notes = instrument.get('notes', [])
                    print(f"\nInstrument: {name}")
                    print(f"  Note count: {len(notes)}")
                    
                    for idx, note in enumerate(notes[:3]):
                        print(f"  Note {idx + 1}: Pitch {note['pitch']}, "
                              f"Start {note['start']}s, End {note['end']}s, "
                              f"Velocity {note['velocity']}")
                
                with open(f"midi_{taskId}.json", "w") as f:
                    json.dump(callback_data, f, indent=2)
                print(f"MIDI data saved to midi_{task_id}.json")
                
        else:
            print(f"MIDI generation failed: {msg}")
        
        return jsonify({'status': 'received'}), 200

    if __name__ == '__main__':
        app.run(host='0.0.0.0', port=3000)
    ```
  </TabItem>

  <TabItem value="php" label="PHP">
    ```php
    <?php
    header('Content-Type: application/json');

    $input = file_get_contents('php://input');
    $data = json_decode($input, true);

    $code = $data['code'] ?? null;
    $msg = $data['msg'] ?? '';
    $taskId = $data['taskId'] ?? '';
    $callbackData = $data['data'] ?? null;

    error_log("Received MIDI generation callback: $taskId, status: $code, message: $msg");

    if ($code === 200) {
        error_log("MIDI generation completed");
        
        if ($callbackData && isset($callbackData['instruments'])) {
            $instruments = $callbackData['instruments'];
            error_log("Detected " . count($instruments) . " instruments");
            
            foreach ($instruments as $instrument) {
                $name = $instrument['name'] ?? '';
                $notes = $instrument['notes'] ?? [];
                error_log("Instrument: $name");
                error_log("  Note count: " . count($notes));
                
                foreach (array_slice($notes, 0, 3) as $idx => $note) {
                    error_log(sprintf(
                        "  Note %d: Pitch %d, Start %ss, End %ss, Velocity %s",
                        $idx + 1,
                        $note['pitch'],
                        $note['start'],
                        $note['end'],
                        $note['velocity']
                    ));
                }
            }
            
            $filename = "midi_$taskId.json";
            file_put_contents($filename, json_encode($callbackData, JSON_PRETTY_PRINT));
            error_log("MIDI data saved to $filename");
        }
        
    } else {
        error_log("MIDI generation failed: $msg");
    }

    http_response_code(200);
    echo json_encode(['status' => 'received']);
    ?>
    ```
  </TabItem>
</Tabs>

## Best Practices

:::tip Callback URL Configuration Recommendations
1. **Use HTTPS**: Ensure callback URL uses HTTPS protocol for secure data transmission
2. **Verify Origin**: Verify the legitimacy of the request source in callback processing
3. **Idempotent Processing**: The same taskId may receive multiple callbacks, ensure processing logic is idempotent
4. **Quick Response**: Callback processing should return 200 status code quickly to avoid timeout
5. **Asynchronous Processing**: Complex business logic (like MIDI file conversion) should be processed asynchronously
6. **Handle Missing Instruments**: Not all instruments may be detected - handle empty or missing instrument arrays gracefully
7. **Store Raw Data**: Save the complete JSON response for future reference and reprocessing
:::

:::warning Important Reminders
- Callback URL must be publicly accessible
- Server must respond within 15 seconds, otherwise will be considered timeout
- If 3 consecutive retry attempts fail, the system will stop sending callbacks
- Please ensure the stability of callback processing logic to avoid callback failures due to exceptions
- MIDI data is retained for 14 days - download and save promptly if needed long-term
- The number and types of instruments detected depends on audio content
- Note times (start/end) may be strings or numbers - handle both types
:::

## Troubleshooting

If you are not receiving callback notifications, please check the following:

<details>
  <summary>Network Connection Issues</summary>

- Confirm callback URL is accessible from public internet
- Check firewall settings to ensure inbound requests are not blocked
- Verify domain name resolution is correct
</details>

<details>
  <summary>Server Response Issues</summary>

- Ensure server returns HTTP 200 status code within 15 seconds
- Check server logs for error messages
- Verify endpoint path and HTTP method are correct
</details>

<details>
  <summary>Content Format Issues</summary>

- Confirm received POST request body is in JSON format
- Check if Content-Type is application/json
- Verify JSON parsing is correct
- Handle both string and number types for timing values
</details>

<details>
  <summary>Data Processing Issues</summary>

- Some instruments may have empty note arrays
- Not all audio will detect all instrument types
- Verify the original vocal separation used `split_stem` type (not `separate_vocal`)
- Check that the source taskId is from a successfully completed separation
</details>

## Alternative Solutions

If you cannot use the callback mechanism, you can also use polling:

    <Card
  title="Poll Query Results"
  icon="lucide-radar"
  href="/suno-api/get-midi-details"
>
Use the Get MIDI Generation Details endpoint to periodically query task status. We recommend querying every 10-30 seconds.
</Card>



# ========== create-music-video-callbacks ==========

# Music Video Generation Callbacks

When MP4 generation is complete, the system will send a POST request to the provided callback URL to notify the result

When you submit a music video generation task to the Suno API, you can use the `callBackUrl` parameter to set a callback URL. The system will automatically push the results to your specified address when the task is completed.

## Callback Mechanism Overview

:::info[]
The callback mechanism eliminates the need to poll the API for task status. The system will proactively push task completion results to your server.
:::

:::tip Webhook Security
To ensure the authenticity and integrity of callback requests, we strongly recommend implementing webhook signature verification. See our [Webhook Verification Guide](/common-api/webhook-verification) for detailed implementation steps.
:::

### Callback Timing

The system will send callback notifications in the following situations:
- Music video generation task completed successfully
- Music video generation task failed
- Errors occurred during task processing

### Callback Method

- **HTTP Method**: POST
- **Content Type**: application/json
- **Timeout Setting**: 15 seconds

## Callback Request Format

When the task is completed, the system will send a POST request to your `callBackUrl` in the following format:

<Tabs>
  <TabItem value="success" label="Success Callback">
    ```json
    {
      "code": 200,
      "msg": "success",
      "data": {
        "task_id": "task_id_5bbe7721119d",
        "video_url": "video_url_847715e66259"
      }
    }
    ```
  </TabItem>
  <TabItem value="failure" label="Failure Callback">
    ```json
    {
      "code": 500,
      "msg": "Internal Error - Please try again later",
      "data": {
        "task_id": "task_id_5bbe7721119d",
        "video_url": null
      }
    }
    ```
  </TabItem>
</Tabs>

## Status Code Description

### code (integer, required)

Callback status code indicating task processing result:

| Status Code | Description |
|-------------|-------------|
| 200 | Success - Request has been processed successfully |
| 500 | Internal Error - Please try again later |

### msg (string, required)

Status message providing detailed status description

### data.task_id (string, required)

Unique identifier of the generation task, consistent with the task_id returned when you submitted the task

### data.video_url (string)

Accessible video URL, returned on success, valid for 14 days

## Callback Reception Examples

Here are example codes for receiving callbacks in popular programming languages:

<Tabs>
  <TabItem value="nodejs" label="Node.js">
    ```javascript
    const express = require('express');
    const app = express();

    app.use(express.json());

    app.post('/suno-video-callback', (req, res) => {
      const { code, msg, data } = req.body;
      
      console.log('Received music video callback:', {
        taskId: data.task_id,
        status: code,
        message: msg
      });
      
      if (code === 200) {
        // Task completed successfully
        console.log('Music video generation completed');
        console.log(`Video URL: ${data.video_url}`);
        console.log('Note: Video link is valid for 14 days');
        
        // Process generated video
        // Can download video, save locally, etc.
        
      } else {
        // Task failed
        console.log('Music video generation failed:', msg);
        
        // Handle failure cases...
      }
      
      // Return 200 status code to confirm callback received
      res.status(200).json({ status: 'received' });
    });

    app.listen(3000, () => {
      console.log('Callback server running on port 3000');
    });
    ```
  </TabItem>

  <TabItem value="python" label="Python">
    ```python
    from flask import Flask, request, jsonify
    import requests
    from datetime import datetime, timedelta

    app = Flask(__name__)

    @app.route('/suno-video-callback', methods=['POST'])
    def handle_callback():
        data = request.json
        
        code = data.get('code')
        msg = data.get('msg')
        callback_data = data.get('data', {})
        task_id = callback_data.get('task_id')
        video_url = callback_data.get('video_url')
        
        print(f"Received music video callback: {task_id}, status: {code}, message: {msg}")
        
        if code == 200:
            # Task completed successfully
            print("Music video generation completed")
            print(f"Video URL: {video_url}")
            print("Note: Video link is valid for 14 days")
            
            # Process generated video
            if video_url:
                try:
                    # Download video file example
                    response = requests.get(video_url)
                    if response.status_code == 200:
                        filename = f"music_video_{task_id}.mp4"
                        with open(filename, "wb") as f:
                            f.write(response.content)
                        print(f"Music video saved as {filename}")
                        
                        # Record expiration time
                        expire_date = datetime.now() + timedelta(days=14)
                        print(f"Video link will expire on {expire_date.strftime('%Y-%m-%d %H:%M:%S')}")
                        
                except Exception as e:
                    print(f"Video download failed: {e}")
                    
        else:
            # Task failed
            print(f"Music video generation failed: {msg}")
            
            # Handle failure cases...
        
        # Return 200 status code to confirm callback received
        return jsonify({'status': 'received'}), 200

    if __name__ == '__main__':
        app.run(host='0.0.0.0', port=3000)
    ```
  </TabItem>

  <TabItem value="php" label="PHP">
    ```php
    <?php
    header('Content-Type: application/json');

    // Get POST data
    $input = file_get_contents('php://input');
    $data = json_decode($input, true);

    $code = $data['code'] ?? null;
    $msg = $data['msg'] ?? '';
    $callbackData = $data['data'] ?? [];
    $taskId = $callbackData['task_id'] ?? '';
    $videoUrl = $callbackData['video_url'] ?? '';

    error_log("Received music video callback: $taskId, status: $code, message: $msg");

    if ($code === 200) {
        // Task completed successfully
        error_log("Music video generation completed");
        error_log("Video URL: $videoUrl");
        error_log("Note: Video link is valid for 14 days");
        
        // Process generated video
        if (!empty($videoUrl)) {
            try {
                // Download video file example
                $videoContent = file_get_contents($videoUrl);
                if ($videoContent !== false) {
                    $filename = "music_video_{$taskId}.mp4";
                    file_put_contents($filename, $videoContent);
                    error_log("Music video saved as $filename");
                    
                    // Record expiration time
                    $expireDate = date('Y-m-d H:i:s', strtotime('+14 days'));
                    error_log("Video link will expire on $expireDate");
                }
            } catch (Exception $e) {
                error_log("Video download failed: " . $e->getMessage());
            }
        }
        
    } else {
        // Task failed
        error_log("Music video generation failed: $msg");
        
        // Handle failure cases...
    }

    // Return 200 status code to confirm callback received
    http_response_code(200);
    echo json_encode(['status' => 'received']);
    ?>
    ```
  </TabItem>
</Tabs>

## Best Practices

:::tip Callback URL Configuration Recommendations
1. **Use HTTPS**: Ensure your callback URL uses HTTPS protocol for secure data transmission
2. **Verify Source**: Verify the legitimacy of the request source in callback processing
3. **Idempotent Processing**: The same task_id may receive multiple callbacks, ensure processing logic is idempotent
4. **Quick Response**: Callback processing should return a 200 status code as quickly as possible to avoid timeout
5. **Asynchronous Processing**: Complex business logic should be processed asynchronously to avoid blocking callback response
6. **Timely Download**: Video links are valid for only 14 days, recommend downloading and saving promptly
:::

:::warning Important Reminders
- Callback URL must be a publicly accessible address
- Server must respond within 15 seconds, otherwise it will be considered a timeout
- If 3 consecutive retries fail, the system will stop sending callbacks
- Please ensure the stability of callback processing logic to avoid callback failures due to exceptions
- **Video URL is valid for 14 days**, please download and save to local storage promptly
- Video files are usually large, pay attention to network stability and storage space when downloading
:::

## Troubleshooting

If you do not receive callback notifications, please check the following:

<details>
  <summary>Network Connection Issues</summary>

- Confirm that the callback URL is accessible from the public network
- Check firewall settings to ensure inbound requests are not blocked
- Verify that domain name resolution is correct
</details>

<details>
  <summary>Server Response Issues</summary>

- Ensure the server returns HTTP 200 status code within 15 seconds
- Check server logs for error messages
- Verify that the interface path and HTTP method are correct
</details>

<details>
  <summary>Content Format Issues</summary>

- Confirm that the received POST request body is in JSON format
- Check that Content-Type is application/json
- Verify that JSON parsing is correct
</details>

<details>
  <summary>Video Processing Issues</summary>

- Confirm that the video URL is accessible
- Check video download permissions and network connections
- Verify that storage space is sufficient
- Note that video files may be large, download time may be long
</details>

## Alternative Solution

If you cannot use the callback mechanism, you can also use polling:

<Card
  title="Poll Query Results"
  icon="lucide-radar"
  href="/suno-api/get-music-video-details"
>
 Use the get music video details endpoint to regularly query task status. We recommend querying every 30 seconds.
</Card>



# ========== generate-music ==========

# Generate Music

## OpenAPI Specification

```yaml
openapi: 3.0.1
info:
  title: ''
  description: ''
  version: 1.0.0
paths:
  /api/v1/generate:
    post:
      summary: Generate Music
      deprecated: false
      description: >-
        Generate music with or without lyrics using AI models.


        ### Usage Guide

        - This endpoint creates music based on your text prompt

        - Multiple variations will be generated for each request

        - You can control detail level with custom mode and instrumental
        settings


        ### Parameter Details

        - In Custom Mode (`customMode: true`):
          - If `instrumental: true`: `style` and `title` are required
          - If `instrumental: false`: `style`, `prompt`, and `title` are required
          - Character limits vary by model:
            - **V4**: `prompt`  3000 characters, `style` 200 characters
            - **V4_5 & V4_5PLUS**: `prompt`  5000 characters, `style` 1000 characters
            - **V4_5ALL**: `prompt`  5000 characters, `style` 1000 characters
            - **V5**: `prompt`  5000 characters, `style` 1000 characters
          - `title` length limit: 80 characters (all models)

        - In Non-custom Mode (`customMode: false`):
          - Only `prompt` is required regardless of `instrumental` setting
          - `prompt` length limit: 500 characters
          - Other parameters should be left empty

        ### Developer Notes

        - Recommendation for new users: Start with `customMode: false` for
        simpler usage

        - Generated files are retained for 14 days

        - Callback process has three stages: `text` (text generation), `first`
        (first track complete), `complete` (all tracks complete)
      operationId: generate-music
      tags:
        - docs/en/Market/Suno API/Music Generation
      parameters: []
      requestBody:
        content:
          application/json:
            schema:
              type: object
              required:
                - prompt
                - customMode
                - instrumental
                - model
                - callBackUrl
              properties:
                prompt:
                  type: string
                  description: >-
                    A description of the desired audio content.  

                    - In Custom Mode (`customMode: true`): Required if
                    `instrumental` is `false`. The prompt will be strictly used
                    as the lyrics and sung in the generated track. Character
                    limits by model:  
                      - **V4**: Maximum 3000 characters  
                      - **V4_5 & V4_5PLUS**: Maximum 5000 characters  
                      - **V4_5ALL**: Maximum 5000 characters  
                      - **V5**: Maximum 5000 characters  
                      Example: "A calm and relaxing piano track with soft melodies"  
                    - In Non-custom Mode (`customMode: false`): Always required.
                    The prompt serves as the core idea, and lyrics will be
                    automatically generated based on it (not strictly matching
                    the input). Maximum 500 characters.  
                      Example: "A short relaxing piano tune"
                  examples:
                    - A calm and relaxing piano track with soft melodies
                style:
                  type: string
                  description: >-
                    Music style specification for the generated audio.  

                    - Required in Custom Mode (`customMode: true`). Defines the
                    genre, mood, or artistic direction.  

                    - Character limits by model:  
                      - **V4**: Maximum 200 characters  
                      - **V4_5 & V4_5PLUS**: Maximum 1000 characters  
                      - **V4_5ALL**: Maximum 1000 characters  
                      - **V5**: Maximum 1000 characters  
                    - Common examples: Jazz, Classical, Electronic, Pop, Rock,
                    Hip-hop, etc.
                  examples:
                    - Classical
                title:
                  type: string
                  description: |-
                    Title for the generated music track.  
                    - Required in Custom Mode (`customMode: true`).  
                    - Max length: 80 characters.  
                    - Will be displayed in player interfaces and filenames.
                  examples:
                    - Peaceful Piano Meditation
                customMode:
                  type: boolean
                  description: >-
                    Determines if advanced parameter customization is enabled.  

                    - If `true`: Allows detailed control with specific
                    requirements for `style` and `title` fields.  

                    - If `false`: Simplified mode where only `prompt` is
                    required and other parameters are ignored.
                  examples:
                    - true
                instrumental:
                  type: boolean
                  description: >-
                    Determines if the audio should be instrumental (no
                    lyrics).  

                    - In Custom Mode (`customMode: true`):  
                      - If `true`: Only `style` and `title` are required.  
                      - If `false`: `style`, `title`, and `prompt` are required (with prompt used as the exact lyrics).  
                    - In Non-custom Mode (`customMode: false`): No impact on
                    required fields (prompt only).
                  examples:
                    - true
                model:
                  type: string
                  description: |-
                    The AI model version to use for generation.  
                    - Required for all requests.  
                    - Available options:  
                      - **`V5`**: Superior musical expression, faster generation.  
                      - **`V4_5PLUS`**: V4.5+ delivers richer sound, new ways to create, max 8 min.  
                      - **`V4_5`**: V4.5 enables smarter prompts, faster generations, max 8 min.  
                      - **`V4_5ALL`**: V4.5ALL enables smarter prompts, faster generations, max 8 min.  
                      - **`V4`**: V4 improves vocal quality, max 4 min.
                  enum:
                    - V4
                    - V4_5
                    - V4_5PLUS
                    - V4_5ALL
                    - V5
                  examples:
                    - V4
                callBackUrl:
                  type: string
                  format: uri
                  description: >-
                    The URL to receive music generation task completion updates.
                    Required for all music generation requests.


                    - System will POST task status and results to this URL when
                    generation completes

                    - Callback process has three stages: `text` (text
                    generation), `first` (first track complete), `complete` (all
                    tracks complete)

                    - Note: Some cases may skip `text` and `first` stages and
                    return `complete` directly

                    - Your callback endpoint should accept POST requests with
                    JSON payload containing task results and audio URLs

                    - For detailed callback format and implementation guide, see
                    [Music Generation
                    Callbacks](https://docs.kie.ai/suno-api/generate-music-callbacks)

                    - Alternatively, use the Get Music Details endpoint to poll
                    task status

                    - To ensure callback security, see [Webhook Verification
                    Guide](/common-api/webhook-verification) for signature
                    verification implementation
                  examples:
                    - https://api.example.com/callback
                negativeTags:
                  type: string
                  description: >-
                    Music styles or traits to exclude from the generated audio.
                    Optional. Use to avoid specific styles.
                  examples:
                    - Heavy Metal, Upbeat Drums
                vocalGender:
                  type: string
                  description: >-
                    Vocal gender preference for the singing voice. Optional. Use
                    'm' for male and 'f' for female. Note: This parameter is
                    only effective when customMode is true. Based on practice,
                    this parameter can only increase the probability but cannot
                    guarantee adherence to male/female voice instructions.
                  enum:
                    - m
                    - f
                  examples:
                    - m
                styleWeight:
                  type: number
                  description: >-
                    Strength of adherence to the specified style. Optional.
                    Range 0–1, up to 2 decimal places.
                  minimum: 0
                  maximum: 1
                  multipleOf: 0.01
                  examples:
                    - 0.65
                weirdnessConstraint:
                  type: number
                  description: >-
                    Controls experimental/creative deviation. Optional. Range
                    0–1, up to 2 decimal places.
                  minimum: 0
                  maximum: 1
                  multipleOf: 0.01
                  examples:
                    - 0.65
                audioWeight:
                  type: number
                  description: >-
                    Balance weight for audio features vs. other factors.
                    Optional. Range 0–1, up to 2 decimal places.
                  minimum: 0
                  maximum: 1
                  multipleOf: 0.01
                  examples:
                    - 0.65
                personaId:
                  type: string
                  description: >-
                    Only available when Custom Mode (`customMode: true`) is
                    enabled. Persona ID to apply to the generated music.
                    Optional. Use this to apply a specific persona style to your
                    music generation. 


                    To generate a persona ID, use the [Generate
                    Persona](https://docs.kie.ai/suno-api/generate-persona)
                    endpoint to create a personalized music Persona based on
                    generated music.
                  examples:
                    - persona_123
              x-apidog-orders:
                - prompt
                - style
                - title
                - customMode
                - instrumental
                - model
                - callBackUrl
                - negativeTags
                - vocalGender
                - styleWeight
                - weirdnessConstraint
                - audioWeight
                - personaId
                - 01KH5V28NSDZMWXJ325JSPFS29
              x-apidog-refs:
                01KH5V28NSDZMWXJ325JSPFS29:
                  type: object
                  properties: {}
              x-apidog-ignore-properties: []
            example:
              prompt: A calm and relaxing piano track with soft melodies
              customMode: true
              instrumental: true
              model: V4
              callBackUrl: https://api.example.com/callback
              style: Classical
              title: Peaceful Piano Meditation
              negativeTags: Heavy Metal, Upbeat Drums
              vocalGender: m
              styleWeight: 0.65
              weirdnessConstraint: 0.65
              audioWeight: 0.65
              personaId: persona_123
              personaModel: style_persona
      responses:
        '200':
          description: Request successful
          content:
            application/json:
              schema:
                allOf:
                  - type: object
                    properties:
                      code:
                        type: integer
                        enum:
                          - 200
                          - 401
                          - 402
                          - 404
                          - 409
                          - 422
                          - 429
                          - 451
                          - 455
                          - 500
                        description: >-
                          Response Status Codes


                          - **200**: Success - Request has been processed
                          successfully  

                          - **401**: Unauthorized - Authentication credentials
                          are missing or invalid  

                          - **402**: Insufficient Credits - Account does not
                          have enough credits to perform the operation  

                          - **404**: Not Found - The requested resource or
                          endpoint does not exist  

                          - **409**: Conflict - WAV record already exists  

                          - **422**: Validation Error - The request parameters
                          failed validation checks  

                          - **429**: Rate Limited - Request limit has been
                          exceeded for this resource  

                          - **451**: Unauthorized - Failed to fetch the image.
                          Kindly verify any access limits set by you or your
                          service provider  

                          - **455**: Service Unavailable - System is currently
                          undergoing maintenance  

                          - **500**: Server Error - An unexpected error occurred
                          while processing the request
                      msg:
                        type: string
                        description: Error message when code != 200
                        examples:
                          - success
                    x-apidog-orders:
                      - code
                      - msg
                    x-apidog-ignore-properties: []
                  - type: object
                    properties:
                      data:
                        type: object
                        properties:
                          taskId:
                            type: string
                            description: >-
                              Task ID for tracking task status. Use this ID with
                              the "Get Music Details" endpoint to query task
                              details and results.
                            examples:
                              - 5c79****be8e
                        x-apidog-orders:
                          - taskId
                        x-apidog-ignore-properties: []
                    x-apidog-orders:
                      - data
                    x-apidog-ignore-properties: []
          headers: {}
          x-apidog-name: ''
        '500':
          description: request failed
          content:
            application/json:
              schema:
                type: object
                properties:
                  code:
                    type: integer
                    description: >-
                      Response status code


                      - **200**: Success - Request has been processed
                      successfully

                      - **401**: Unauthorized - Authentication credentials are
                      missing or invalid

                      - **402**: Insufficient Credits - Account does not have
                      enough credits to perform the operation

                      - **404**: Not Found - The requested resource or endpoint
                      does not exist

                      - **422**: Validation Error - The request parameters
                      failed validation checks

                      - **429**: Rate Limited - Request limit has been exceeded
                      for this resource

                      - **455**: Service Unavailable - System is currently
                      undergoing maintenance

                      - **500**: Server Error - An unexpected error occurred
                      while processing the request

                      - **501**: Generation Failed - Content generation task
                      failed

                      - **505**: Feature Disabled - The requested feature is
                      currently disabled
                  msg:
                    type: string
                    description: Response message, error description when failed
                  data:
                    type: object
                    properties: {}
                    x-apidog-orders: []
                    x-apidog-ignore-properties: []
                x-apidog-orders:
                  - code
                  - msg
                  - data
                required:
                  - code
                  - msg
                  - data
                x-apidog-ignore-properties: []
              example:
                code: 500
                msg: >-
                  Server Error - An unexpected error occurred while processing
                  the request
                data: null
          headers: {}
          x-apidog-name: 'Error '
      security:
        - BearerAuth: []
          x-apidog:
            schemeGroups:
              - id: kn8M4YUlc5i0A0179ezwx
                schemeIds:
                  - BearerAuth
            required: true
            use:
              id: kn8M4YUlc5i0A0179ezwx
            scopes:
              kn8M4YUlc5i0A0179ezwx:
                BearerAuth: []
      callbacks:
        audioGenerated:
          '{request.body#/callBackUrl}':
            post:
              description: >-
                System will call this callback when audio generation is
                complete.


                ### Callback Example

                ```json

                {
                  "code": 200,
                  "msg": "All generated successfully.",
                  "data": {
                    "callbackType": "complete",
                    "task_id": "2fac****9f72",
                    "data": [
                      {
                        "id": "e231****-****-****-****-****8cadc7dc",
                        "audio_url": "https://example.cn/****.mp3",
                        "stream_audio_url": "https://example.cn/****",
                        "image_url": "https://example.cn/****.jpeg",
                        "prompt": "[Verse] Night city lights shining bright",
                        "model_name": "chirp-v3-5",
                        "title": "Iron Man",
                        "tags": "electrifying, rock",
                        "createTime": "2025-01-01 00:00:00",
                        "duration": 198.44
                      },
                      {
                        "id": "bd15****1873",
                        "audio_url": "https://example.cn/****.mp3",
                        "stream_audio_url": "https://example.cn/****",
                        "image_url": "https://example.cn/****.jpeg",
                        "prompt": "[Verse] Night city lights shining bright",
                        "model_name": "chirp-v3-5",
                        "title": "Iron Man",
                        "tags": "electrifying, rock",
                        "createTime": "2025-01-01 00:00:00",
                        "duration": 228.28
                      }
                    ]
                  }
                }

                ```
              requestBody:
                content:
                  application/json:
                    schema:
                      type: object
                      properties:
                        code:
                          type: integer
                          description: Status code
                          example: 200
                        msg:
                          type: string
                          description: Response message
                          example: All generated successfully
                        data:
                          type: object
                          properties:
                            callbackType:
                              type: string
                              description: >-
                                Callback type: text (text generation complete),
                                first (first track complete), complete (all
                                tracks complete)
                              enum:
                                - text
                                - first
                                - complete
                            task_id:
                              type: string
                              description: Task ID
                            data:
                              type: array
                              items:
                                type: object
                                properties:
                                  id:
                                    type: string
                                    description: Audio unique identifier (audioId)
                                  audio_url:
                                    type: string
                                    description: Audio file URL
                                  stream_audio_url:
                                    type: string
                                    description: Streaming audio URL
                                  image_url:
                                    type: string
                                    description: Cover image URL
                                  prompt:
                                    type: string
                                    description: Generation prompt/lyrics
                                  model_name:
                                    type: string
                                    description: Model name used
                                  title:
                                    type: string
                                    description: Music title
                                  tags:
                                    type: string
                                    description: Music tags
                                  createTime:
                                    type: string
                                    description: Creation time
                                    format: date-time
                                  duration:
                                    type: number
                                    description: Audio duration (seconds)
              responses:
                '200':
                  description: Callback received successfully
                  content:
                    application/json:
                      schema:
                        allOf:
                          - type: object
                            properties:
                              code:
                                type: integer
                                enum:
                                  - 200
                                  - 400
                                  - 408
                                  - 413
                                  - 500
                                  - 501
                                  - 531
                                description: >-
                                  Response status code


                                  - **200**: Success - Request has been
                                  processed successfully

                                  - **400**: Validation Error - Lyrics contained
                                  copyrighted material.

                                  - **408**: Rate Limited - Timeout.

                                  - **413**: Conflict - Uploaded audio matches
                                  existing work of art.

                                  - **500**: Server Error - An unexpected error
                                  occurred while processing the request

                                  - **501**: Audio generation failed.

                                  - **531**: Server Error - Sorry, the
                                  generation failed due to an issue. Your
                                  credits have been refunded. Please try again.
                              msg:
                                type: string
                                description: Error message when code != 200
                                example: success
                      example:
                        code: 200
                        msg: success
      x-apidog-folder: docs/en/Market/Suno API/Music Generation
      x-apidog-status: released
      x-run-in-apidog: https://app.apidog.com/web/project/1184766/apis/api-28506283-run
components:
  schemas: {}
  securitySchemes:
    BearerAuth:
      type: bearer
      scheme: bearer
      bearerFormat: API Key
      description: |-
        所有 API 均需要通过 Bearer Token 进行身份验证。

        获取 API Key：
        1. 访问 [API Key 管理页面](https://kie.ai/api-key) 获取您的 API Key

        使用方法：
        在请求头中添加：
        Authorization: Bearer YOUR_API_KEY

        注意：
        - 请妥善保管您的 API Key，不要与他人分享
        - 如果您怀疑 API Key 已泄露，请立即在管理页面重置
servers:
  - url: https://api.kie.ai
    description: 正式环境
security:
  - BearerAuth: []
    x-apidog:
      schemeGroups:
        - id: kn8M4YUlc5i0A0179ezwx
          schemeIds:
            - BearerAuth
      required: true
      use:
        id: kn8M4YUlc5i0A0179ezwx
      scopes:
        kn8M4YUlc5i0A0179ezwx:
          BearerAuth: []

```


# ========== extend-music ==========

# Extend Music

## OpenAPI Specification

```yaml
openapi: 3.0.1
info:
  title: ''
  description: ''
  version: 1.0.0
paths:
  /api/v1/generate/extend:
    post:
      summary: Extend Music
      deprecated: false
      description: >-
        Extend or modify existing music by creating a continuation based on a
        source audio track.


        ### Usage Guide

        - This endpoint allows you to extend existing music tracks

        - You can choose to use original parameters or set new custom parameters

        - Extended music will maintain style consistency with the source track


        ### Parameter Details

        - With Custom Parameters (`defaultParamFlag: true`):
          - `prompt`, `style`, `title` and `continueAt` are required
          - Character limits vary by model:
            - **V4**: `prompt` 3000 characters, `style` 200 characters, `title` 80 characters
            - **V4_5 & V4_5PLUS**: `prompt` 5000 characters, `style` 1000 characters, `title` 100 characters
            - **V4_5ALL**: `prompt` 5000 characters, `style` 1000 characters, `title` 80 characters
            - **V5**: `prompt` 5000 characters, `style` 1000 characters, `title` 100 characters

        - With Original Parameters (`defaultParamFlag: false`):
          - Only `audioId` is required
          - Other parameters will be inherited from the source audio

        ### Developer Notes

        - Generated files are retained for 14 days

        - Model version must match the source audio's model version

        - Callback process follows the same pattern as the music generation
        endpoint
      operationId: extend-music
      tags:
        - docs/en/Market/Suno API/Music Generation
      parameters: []
      requestBody:
        content:
          application/json:
            schema:
              type: object
              required:
                - defaultParamFlag
                - audioId
                - prompt
                - model
                - callBackUrl
              properties:
                defaultParamFlag:
                  type: boolean
                  description: >-
                    Controls parameter source for extension.  

                    - If `true`: Use custom parameters specified in this
                    request. Requires `continueAt`, `prompt`, `style`, and
                    `title`.  

                    - If `false`: Use original audio parameters. Only `audioId`
                    is required, other parameters are inherited.
                  examples:
                    - true
                audioId:
                  type: string
                  description: >-
                    Unique identifier of the audio track to extend. Required for
                    all extension requests.
                  examples:
                    - e231****-****-****-****-****8cadc7dc
                prompt:
                  type: string
                  description: >-
                    Description of the desired audio extension content.  

                    - Required when `defaultParamFlag` is `true`.  

                    - Character limits by model:  
                      - **V4**: Maximum 3000 characters  
                      - **V4_5 & V4_5PLUS**: Maximum 5000 characters  
                      - **V4_5ALL**: Maximum 5000 characters  
                      - **V5**: Maximum 5000 characters  
                    - Describes how the music should continue or change in the
                    extension.
                  examples:
                    - >-
                      Extend the music with more relaxing notes and a gentle
                      bridge section
                style:
                  type: string
                  description: >-
                    Music style specification for the extended audio.  

                    - Required when `defaultParamFlag` is `true`.  

                    - Character limits by model:  
                      - **V4**: Maximum 200 characters  
                      - **V4_5 & V4_5PLUS**: Maximum 1000 characters  
                      - **V4_5ALL**: Maximum 1000 characters  
                      - **V5**: Maximum 1000 characters  
                    - Should typically align with the original audio's style for
                    best results.
                  examples:
                    - Classical
                title:
                  type: string
                  description: |-
                    Title for the extended music track.  
                    - Required when `defaultParamFlag` is `true`.  
                    - Character limits by model:  
                      - **V4**: Maximum 80 characters  
                      - **V4_5 & V4_5PLUS**: Maximum 100 characters  
                      - **V4_5ALL**: Maximum 80 characters  
                      - **V5**: Maximum 100 characters  
                    - Will be displayed in player interfaces and filenames.
                  examples:
                    - Peaceful Piano Extended
                continueAt:
                  type: number
                  description: >-
                    The time point (in seconds) from which to start extending
                    the music.  

                    - Required when `defaultParamFlag` is `true`.  

                    - Value range: greater than 0 and less than the total
                    duration of the generated audio.  

                    - Specifies the position in the original track where the
                    extension should begin.
                  examples:
                    - 60
                model:
                  type: string
                  description: |-
                    The AI model version to use for generation.  
                    - Required for all requests.  
                    - Available options:  
                      - **`V5`**: Superior musical expression, faster generation.  
                      - **`V4_5PLUS`**: V4.5+ delivers richer sound, new ways to create, max 8 min.  
                      - **`V4_5`**: V4.5 enables smarter prompts, faster generations, max 8 min.  
                      - **`V4_5ALL`**: V4.5ALL enables smarter prompts, faster generations, max 8 min.  
                      - **`V4`**: V4 improves vocal quality, max 4 min.
                  enum:
                    - V4
                    - V4_5
                    - V4_5PLUS
                    - V4_5ALL
                    - V5
                  examples:
                    - V4
                callBackUrl:
                  type: string
                  format: uri
                  description: >-
                    The URL to receive music extension task completion updates.
                    Required for all music extension requests.


                    - System will POST task status and results to this URL when
                    extension completes

                    - Callback process has three stages: `text` (text
                    generation), `first` (first track complete), `complete` (all
                    tracks complete)

                    - Your callback endpoint should accept POST requests with
                    JSON payload containing extended track results and audio
                    URLs

                    - For detailed callback format and implementation guide, see
                    [Music Extension
                    Callbacks](https://docs.kie.ai/suno-api/extend-music-callbacks)

                    - Alternatively, use the Get Music Details endpoint to poll
                    task status

                    - To ensure callback security, see [Webhook Verification
                    Guide](/common-api/webhook-verification) for signature
                    verification implementation
                  examples:
                    - https://api.example.com/callback
                negativeTags:
                  type: string
                  description: >-
                    Music styles or traits to exclude from the extended audio.
                    Optional. Use to avoid specific undesired characteristics.
                  examples:
                    - Heavy Metal, Upbeat Drums
                vocalGender:
                  type: string
                  description: >-
                    Vocal gender preference for the singing voice. Optional. Use
                    'm' for male and 'f' for female. Based on practice, this
                    parameter can only increase the probability but cannot
                    guarantee adherence to male/female voice instructions.
                  enum:
                    - m
                    - f
                  examples:
                    - m
                styleWeight:
                  type: number
                  description: >-
                    Strength of adherence to the specified style. Optional.
                    Range 0–1, up to 2 decimal places.
                  minimum: 0
                  maximum: 1
                  multipleOf: 0.01
                  examples:
                    - 0.65
                weirdnessConstraint:
                  type: number
                  description: >-
                    Controls experimental/creative deviation. Optional. Range
                    0–1, up to 2 decimal places.
                  minimum: 0
                  maximum: 1
                  multipleOf: 0.01
                  examples:
                    - 0.65
                audioWeight:
                  type: number
                  description: >-
                    Balance weight for audio features vs. other factors.
                    Optional. Range 0–1, up to 2 decimal places.
                  minimum: 0
                  maximum: 1
                  multipleOf: 0.01
                  examples:
                    - 0.65
                personaId:
                  type: string
                  description: >-
                    Only available when Custom Mode (`customMode: true`) is
                    enabled. Persona ID to apply to the generated music.
                    Optional. Use this to apply a specific persona style to your
                    music generation. 


                    To generate a persona ID, use the [](generate-persona)
                    endpoint to create a personalized music Persona based on
                    generated music.
                  examples:
                    - persona_123
              x-apidog-orders:
                - defaultParamFlag
                - audioId
                - prompt
                - style
                - title
                - continueAt
                - model
                - callBackUrl
                - negativeTags
                - vocalGender
                - styleWeight
                - weirdnessConstraint
                - audioWeight
                - personaId
                - 01KH5V3MA50W3NF9XV737X3882
              x-apidog-refs:
                01KH5V3MA50W3NF9XV737X3882:
                  type: object
                  properties: {}
              x-apidog-ignore-properties: []
            example:
              defaultParamFlag: true
              audioId: e231****-****-****-****-****8cadc7dc
              prompt: >-
                Extend the music with more relaxing notes and a gentle bridge
                section
              model: V4
              callBackUrl: https://api.example.com/callback
              style: Classical
              title: Peaceful Piano Extended
              continueAt: 60
              negativeTags: Heavy Metal, Upbeat Drums
              vocalGender: m
              styleWeight: 0.65
              weirdnessConstraint: 0.65
              audioWeight: 0.65
              personaId: persona_123
              personaModel: style_persona
      responses:
        '200':
          description: Request successful
          content:
            application/json:
              schema:
                allOf:
                  - type: object
                    properties:
                      code:
                        type: integer
                        enum:
                          - 200
                          - 401
                          - 402
                          - 404
                          - 409
                          - 422
                          - 429
                          - 451
                          - 455
                          - 500
                        description: >-
                          Response status code


                          - **200**: Success - Request has been processed
                          successfully

                          - **401**: Unauthorized - Authentication credentials
                          are missing or invalid

                          - **402**: Insufficient Credits - Account does not
                          have enough credits to perform the operation

                          - **404**: Not Found - The requested resource or
                          endpoint does not exist

                          - **409**: Conflict - WAV record already exists

                          - **422**: Validation Error - The request parameters
                          failed validation checks

                          - **429**: Rate Limited - Request limit has been
                          exceeded for this resource

                          - **451**: Unauthorized - Failed to fetch the image.
                          Kindly verify any access limits set by you or your
                          service provider.

                          - **455**: Service Unavailable - System is currently
                          undergoing maintenance

                          - **500**: Server Error - An unexpected error occurred
                          while processing the request
                      msg:
                        type: string
                        description: Error message when code != 200
                        examples:
                          - success
                    x-apidog-orders:
                      - code
                      - msg
                    x-apidog-ignore-properties: []
                  - type: object
                    properties:
                      data:
                        type: object
                        properties:
                          taskId:
                            type: string
                            description: >-
                              Task ID for tracking task status. Use this ID with
                              the "Get Music Details" endpoint to query
                              extension task details and results.
                            examples:
                              - 5c79****be8e
                        x-apidog-orders:
                          - taskId
                        x-apidog-ignore-properties: []
                    x-apidog-orders:
                      - data
                    x-apidog-ignore-properties: []
          headers: {}
          x-apidog-name: ''
        '500':
          description: request failed
          content:
            application/json:
              schema:
                type: object
                properties:
                  code:
                    type: integer
                    description: >-
                      Response status code


                      - **200**: Success - Request has been processed
                      successfully

                      - **401**: Unauthorized - Authentication credentials are
                      missing or invalid

                      - **402**: Insufficient Credits - Account does not have
                      enough credits to perform the operation

                      - **404**: Not Found - The requested resource or endpoint
                      does not exist

                      - **422**: Validation Error - The request parameters
                      failed validation checks

                      - **429**: Rate Limited - Request limit has been exceeded
                      for this resource

                      - **455**: Service Unavailable - System is currently
                      undergoing maintenance

                      - **500**: Server Error - An unexpected error occurred
                      while processing the request

                      - **501**: Generation Failed - Content generation task
                      failed

                      - **505**: Feature Disabled - The requested feature is
                      currently disabled
                  msg:
                    type: string
                    description: Response message, error description when failed
                  data:
                    type: object
                    properties: {}
                    x-apidog-orders: []
                    x-apidog-ignore-properties: []
                x-apidog-orders:
                  - code
                  - msg
                  - data
                required:
                  - code
                  - msg
                  - data
                x-apidog-ignore-properties: []
              example:
                code: 500
                msg: >-
                  Server Error - An unexpected error occurred while processing
                  the request
                data: null
          headers: {}
          x-apidog-name: 'Error '
      security:
        - BearerAuth: []
          x-apidog:
            schemeGroups:
              - id: kn8M4YUlc5i0A0179ezwx
                schemeIds:
                  - BearerAuth
            required: true
            use:
              id: kn8M4YUlc5i0A0179ezwx
            scopes:
              kn8M4YUlc5i0A0179ezwx:
                BearerAuth: []
      callbacks:
        audioExtend:
          '{$request.body#/callBackUrl}':
            post:
              description: >-
                System will call this callback when audio generation is
                complete.


                ### Callback Example

                ```json

                {
                  "code": 200,
                  "msg": "All generated successfully.",
                  "data": {
                    "callbackType": "complete",
                    "task_id": "2fac****9f72",
                    "data": [
                      {
                        "id": "e231****-****-****-****-****8cadc7dc",
                        "audio_url": "https://example.cn/****.mp3",
                        "stream_audio_url": "https://example.cn/****",
                        "image_url": "https://example.cn/****.jpeg",
                        "prompt": "[Verse] Night city lights shining bright",
                        "model_name": "chirp-v3-5",
                        "title": "Iron Man",
                        "tags": "electrifying, rock",
                        "createTime": "2025-01-01 00:00:00",
                        "duration": 198.44
                      },
                      {
                        "id": "bd15****1873",
                        "audio_url": "https://example.cn/****.mp3",
                        "stream_audio_url": "https://example.cn/****",
                        "image_url": "https://example.cn/****.jpeg",
                        "prompt": "[Verse] Night city lights shining bright",
                        "model_name": "chirp-v3-5",
                        "title": "Iron Man",
                        "tags": "electrifying, rock",
                        "createTime": "2025-01-01 00:00:00",
                        "duration": 228.28
                      }
                    ]
                  }
                }

                ```
              requestBody:
                content:
                  application/json:
                    schema:
                      type: object
                      properties:
                        code:
                          type: integer
                          description: Status code
                          example: 200
                        msg:
                          type: string
                          description: Response message
                          example: All generated successfully
                        data:
                          type: object
                          properties:
                            callbackType:
                              type: string
                              description: >-
                                Callback type: text (text generation complete),
                                first (first track complete), complete (all
                                tracks complete)
                              enum:
                                - text
                                - first
                                - complete
                            task_id:
                              type: string
                              description: Task ID
                            data:
                              type: array
                              items:
                                type: object
                                properties:
                                  id:
                                    type: string
                                    description: Audio unique identifier (audioId)
                                  audio_url:
                                    type: string
                                    description: Audio file URL
                                  stream_audio_url:
                                    type: string
                                    description: Streaming audio URL
                                  image_url:
                                    type: string
                                    description: Cover image URL
                                  prompt:
                                    type: string
                                    description: Generation prompt/lyrics
                                  model_name:
                                    type: string
                                    description: Model name used
                                  title:
                                    type: string
                                    description: Music title
                                  tags:
                                    type: string
                                    description: Music tags
                                  createTime:
                                    type: string
                                    description: Creation time
                                    format: date-time
                                  duration:
                                    type: number
                                    description: Audio duration (seconds)
              responses:
                '200':
                  description: Callback received successfully
                  content:
                    application/json:
                      schema:
                        allOf:
                          - type: object
                            properties:
                              code:
                                type: integer
                                enum:
                                  - 200
                                  - 400
                                  - 408
                                  - 413
                                  - 500
                                  - 501
                                  - 531
                                description: >-
                                  Response status code


                                  - **200**: Success - Request has been
                                  processed successfully

                                  - **400**: Validation Error - Lyrics contained
                                  copyrighted material.

                                  - **408**: Rate Limited - Timeout.

                                  - **413**: Conflict - Uploaded audio matches
                                  existing work of art.

                                  - **500**: Server Error - An unexpected error
                                  occurred while processing the request

                                  - **501**: Audio generation failed.

                                  - **531**: Server Error - Sorry, the
                                  generation failed due to an issue. Your
                                  credits have been refunded. Please try again.
                              msg:
                                type: string
                                description: Error message when code != 200
                                example: success
                      example:
                        code: 200
                        msg: success
      x-apidog-folder: docs/en/Market/Suno API/Music Generation
      x-apidog-status: released
      x-run-in-apidog: https://app.apidog.com/web/project/1184766/apis/api-28506284-run
components:
  schemas: {}
  securitySchemes:
    BearerAuth:
      type: bearer
      scheme: bearer
      bearerFormat: API Key
      description: |-
        所有 API 均需要通过 Bearer Token 进行身份验证。

        获取 API Key：
        1. 访问 [API Key 管理页面](https://kie.ai/api-key) 获取您的 API Key

        使用方法：
        在请求头中添加：
        Authorization: Bearer YOUR_API_KEY

        注意：
        - 请妥善保管您的 API Key，不要与他人分享
        - 如果您怀疑 API Key 已泄露，请立即在管理页面重置
servers:
  - url: https://api.kie.ai
    description: 正式环境
security:
  - BearerAuth: []
    x-apidog:
      schemeGroups:
        - id: kn8M4YUlc5i0A0179ezwx
          schemeIds:
            - BearerAuth
      required: true
      use:
        id: kn8M4YUlc5i0A0179ezwx
      scopes:
        kn8M4YUlc5i0A0179ezwx:
          BearerAuth: []

```


# ========== upload-and-cover-audio ==========

# Upload And Cover Audio

## OpenAPI Specification

```yaml
openapi: 3.0.1
info:
  title: ''
  description: ''
  version: 1.0.0
paths:
  /api/v1/generate/upload-cover:
    post:
      summary: Upload And Cover Audio
      deprecated: false
      description: >-
        > This API creates a cover version of an audio track by transforming it
        into a new style while retaining its core melody. It incorporates Suno's
        upload capability, enabling users to upload an audio file for
        processing. The expected result is a refreshed audio track with a new
        style, keeping the original melody intact.


        ## Parameter Usage Guide


        :::note Character Limits

        Character limits vary depending on the model version:


        *   **Model V5**: `style` (max 1000 chars), `title` (max 100 chars),
        `prompt` (max 5000 chars)

        *   **Models V4.5PLUS and V4.5**: `style` (max 1000 chars), `title` (max
        100 chars), `prompt` (max 5000 chars)

        *   **Model V4.5ALL**: `style` (max 1000 chars), `title` (max 80 chars),
        `prompt` (max 5000 chars)

        *   **Model V4**: `style` (max 200 chars), `title` (max 80 chars),
        `prompt` (max 3000 chars)

        :::


        *   **When `customMode` is `true` (Custom Mode):**
            *   If `instrumental` is `true`: `style`, `title`, and `uploadUrl` are required.
            *   If `instrumental` is `false`: `style`, `prompt`, `title`, and `uploadUrl` are required.
            *   **Character limits vary by model version** (see note above).
            *   `uploadUrl` is used to specify the upload location of the audio file; ensure the uploaded audio does not exceed 8 minutes in length.

        *   **When `customMode` is `false` (Non-custom Mode):**
            *   Only `prompt` and `uploadUrl` are required, regardless of the `instrumental` setting.
            *   `prompt` length limit: 500 characters.
            *   Other parameters should be left empty.

        ## Developer Notes


        1.  **Quick Start for New Users:** Set `customMode` to `false`,
        `instrumental` to `false`, and provide only `prompt` and `uploadUrl`.
        This is the simplest configuration to quickly test the API and
        experience the results.

        2.  Generated files will be deleted after **15 days**.

        3.  Ensure all required parameters are provided based on the
        `customMode` and `instrumental` settings to avoid errors.

        4.  Pay attention to character limits for `prompt`, `style`, and `title`
        to ensure successful processing.

        5.  **Callback Process Stages:** The callback process has three stages:
        `text` (text generation complete), `first` (first track complete), and
        `complete` (all tracks complete).

        6.  **Active Status Check:** You can use the [Get Music Generation
        Details](/suno-api/get-music-details) endpoint to actively check the
        task status instead of waiting for callbacks.

        7.  The `uploadUrl` parameter is used to specify the upload location of
        the audio file; please provide a valid URL.


        ## Optional Parameters


        *   `vocalGender` (`string`): Vocal gender preference. Use `m` for male,
        `f` for female.

        *   `styleWeight` (`number`): Strength of adherence to style. Range 0–1,
        up to 2 decimal places. Example: `0.65`.

        *   `weirdnessConstraint` (`number`): Controls creative deviation. Range
        0–1, up to 2 decimal places. Example: `0.65`.

        *   `audioWeight` (`number`): Balance weight for audio features. Range
        0–1, up to 2 decimal places. Example: `0.65`.

        *   `personaId` (`string`): Persona ID to apply to the generated music.
        Only available when Custom Mode is enabled (i.e., `customMode` is
        `true`). To create one, use [Generate
        Persona](/suno-api/generate-persona).
      operationId: upload-and-cover-audio
      tags:
        - docs/en/Market/Suno API/Music Generation
      parameters: []
      requestBody:
        content:
          application/json:
            schema:
              type: object
              required:
                - uploadUrl
                - prompt
                - customMode
                - instrumental
                - model
                - callBackUrl
              properties:
                uploadUrl:
                  type: string
                  format: uri
                  description: >-
                    The URL for uploading audio files, required regardless of
                    whether customMode and instrumental are true or false.
                    Ensure the uploaded audio does not exceed 8 minutes in
                    length.
                  examples:
                    - https://storage.example.com/upload
                prompt:
                  type: string
                  description: >-
                    A description of the desired audio content.  

                    - In Custom Mode (`customMode: true`):  Required if
                    `instrumental` is `false`. The prompt will be strictly used
                    as the lyrics and sung in the generated track. Character
                    limits by model:  
                      - **V5**: Maximum 5000 characters  
                      - **V4_5PLUS & V4_5**: Maximum 5000 characters  
                      - **V4_5ALL**: Maximum 5000 characters  
                      - **V4**: Maximum 3000 characters  
                      Example: "A calm and relaxing piano track with soft melodies"  
                    - In Non-custom Mode (`customMode: false`): Always required.
                    The prompt serves as the core idea, and lyrics will be
                    automatically generated based on it (not strictly matching
                    the input). Max length: 500 characters.  
                      Example: "A short relaxing piano tune" 
                  examples:
                    - A calm and relaxing piano track with soft melodies
                style:
                  type: string
                  description: >-
                    The music style or genre for the audio.  

                    - Required in Custom Mode (`customMode: true`). Examples:
                    "Jazz", "Classical", "Electronic". Character limits by
                    model:  
                      - **V5**: Maximum 1000 characters  
                      - **V4_5PLUS & V4_5**: Maximum 1000 characters  
                      - **V4_5ALL**: Maximum 1000 characters  
                      - **V4**: Maximum 200 characters  
                      Example: "Classical"  
                    - In Non-custom Mode (`customMode: false`): Leave empty.
                  examples:
                    - Classical
                title:
                  type: string
                  description: >-
                    The title of the generated music track.  

                    - Required in Custom Mode (`customMode: true`). Character
                    limits by model:  
                      - **V5**: Maximum 100 characters  
                      - **V4_5PLUS & V4_5**: Maximum 100 characters  
                      - **V4_5ALL**: Maximum 80 characters  
                      - **V4**: Maximum 80 characters  
                      Example: "Peaceful Piano Meditation"  
                    - In Non-custom Mode (`customMode: false`): Leave empty.
                  examples:
                    - Peaceful Piano Meditation
                customMode:
                  type: boolean
                  description: >-
                    Enables Custom Mode for advanced audio generation
                    settings.  

                    - Set to `true` to use Custom Mode (requires `style` and
                    `title`; `prompt` required if `instrumental` is `false`).
                    The prompt will be strictly used as lyrics if `instrumental`
                    is `false`.  

                    - Set to `false` for Non-custom Mode (only `prompt` is
                    required). Lyrics will be auto-generated based on the
                    prompt.
                  examples:
                    - true
                instrumental:
                  type: boolean
                  description: >-
                    Determines if the audio should be instrumental (no
                    lyrics).  

                    - In Custom Mode (`customMode: true`):  
                      - If `true`: Only `style` and `title` are required.  
                      - If `false`: `style`, `title`, and `prompt` are required (with `prompt` used as the exact lyrics).  
                    - In Non-custom Mode (`customMode: false`): No impact on
                    required fields (`prompt` only). Lyrics are auto-generated
                    if `instrumental` is `false`.
                  examples:
                    - true
                model:
                  type: string
                  description: |-
                    The AI model version to use for generation.  
                    - Required for all requests.  
                    - Available options:  
                      - **`V5`**: Superior musical expression, faster generation.  
                      - **`V4_5PLUS`**: V4.5+ delivers richer sound, new ways to create, max 8 min.  
                      - **`V4_5`**: V4.5 enables smarter prompts, faster generations, max 8 min.  
                      - **`V4_5ALL`**: V4.5ALL enables smarter prompts, faster generations, max 8 min.  
                      - **`V4`**: V4 improves vocal quality, max 4 min.
                  enum:
                    - V4
                    - V4_5
                    - V4_5PLUS
                    - V4_5ALL
                    - V5
                  examples:
                    - V4
                negativeTags:
                  type: string
                  description: >-
                    Music styles or traits to exclude from the generated
                    audio.  

                    - Optional. Use to avoid specific styles.  
                      Example: "Heavy Metal, Upbeat Drums"
                  examples:
                    - Heavy Metal, Upbeat Drums
                callBackUrl:
                  type: string
                  format: uri
                  description: >-
                    The URL to receive audio covering task completion updates.
                    Required for all audio covering requests.


                    - System will POST task status and results to this URL when
                    audio covering completes

                    - Callback includes generated covered audio files with new
                    style while preserving original melody

                    - Your callback endpoint should accept POST requests with
                    JSON payload containing covered track results and audio URLs

                    - For detailed callback format and implementation guide, see
                    [Audio Covering
                    Callbacks](https://docs.kie.ai/suno-api/upload-and-cover-audio-callbacks)

                    - Alternatively, use the Get Music Details endpoint to poll
                    task status

                    - To ensure callback security, see [Webhook Verification
                    Guide](/common-api/webhook-verification) for signature
                    verification implementation
                  examples:
                    - https://api.example.com/callback
                vocalGender:
                  type: string
                  description: >-
                    Vocal gender preference for the singing voice. Optional. Use
                    'm' for male and 'f' for female. Note: This parameter is
                    only effective when customMode is true. Based on practice,
                    this parameter can only increase the probability but cannot
                    guarantee adherence to male/female voice instructions.
                  enum:
                    - m
                    - f
                  examples:
                    - m
                styleWeight:
                  type: number
                  description: >-
                    Strength of adherence to the specified style. Optional.
                    Range 0–1, up to 2 decimal places.
                  minimum: 0
                  maximum: 1
                  multipleOf: 0.01
                  examples:
                    - 0.65
                weirdnessConstraint:
                  type: number
                  description: >-
                    Controls experimental/creative deviation. Optional. Range
                    0–1, up to 2 decimal places.
                  minimum: 0
                  maximum: 1
                  multipleOf: 0.01
                  examples:
                    - 0.65
                audioWeight:
                  type: number
                  description: >-
                    Balance weight for audio features vs. other factors.
                    Optional. Range 0–1, up to 2 decimal places.
                  minimum: 0
                  maximum: 1
                  multipleOf: 0.01
                  examples:
                    - 0.65
                personaId:
                  type: string
                  description: >-
                    Only available when Custom Mode (`customMode: true`) is
                    enabled. Persona ID to apply to the generated music.
                    Optional. Use this to apply a specific persona style to your
                    music generation. 


                    To generate a persona ID, use the [Generate
                    Persona](https://docs.kie.ai/suno-api/generate-persona)
                    endpoint to create a personalized music Persona based on
                    generated music.
                  examples:
                    - persona_123
              x-apidog-orders:
                - uploadUrl
                - prompt
                - style
                - title
                - customMode
                - instrumental
                - model
                - negativeTags
                - callBackUrl
                - vocalGender
                - styleWeight
                - weirdnessConstraint
                - audioWeight
                - personaId
                - 01KH5V41Q3E8XKP9P8AJVPBG98
              x-apidog-refs:
                01KH5V41Q3E8XKP9P8AJVPBG98:
                  type: object
                  properties: {}
              x-apidog-ignore-properties: []
            example:
              uploadUrl: https://storage.example.com/upload
              prompt: A calm and relaxing piano track with soft melodies
              customMode: true
              instrumental: true
              model: V4
              callBackUrl: https://api.example.com/callback
              style: Classical
              title: Peaceful Piano Meditation
              negativeTags: Heavy Metal, Upbeat Drums
              vocalGender: m
              styleWeight: 0.65
              weirdnessConstraint: 0.65
              audioWeight: 0.65
              personaId: persona_123
              personaModel: style_persona
      responses:
        '200':
          description: Request successful
          content:
            application/json:
              schema:
                allOf:
                  - type: object
                    properties:
                      code:
                        type: integer
                        enum:
                          - 200
                          - 401
                          - 402
                          - 404
                          - 409
                          - 422
                          - 429
                          - 451
                          - 455
                          - 500
                        description: >-
                          Response status code


                          - **200**: Success - Request has been processed
                          successfully

                          - **401**: Unauthorized - Authentication credentials
                          are missing or invalid

                          - **402**: Insufficient Credits - Account does not
                          have enough credits to perform the operation

                          - **404**: Not Found - The requested resource or
                          endpoint does not exist

                          - **409**: Conflict - WAV record already exists

                          - **422**: Validation Error - The request parameters
                          failed validation checks

                          - **429**: Rate Limited - Request limit has been
                          exceeded for this resource

                          - **451**: Unauthorized - Failed to fetch the image.
                          Kindly verify any access limits set by you or your
                          service provider.

                          - **455**: Service Unavailable - System is currently
                          undergoing maintenance

                          - **500**: Server Error - An unexpected error occurred
                          while processing the request
                      msg:
                        type: string
                        description: Error message when code != 200
                        examples:
                          - success
                    x-apidog-orders:
                      - code
                      - msg
                    x-apidog-ignore-properties: []
                  - type: object
                    properties:
                      data:
                        type: object
                        properties:
                          taskId:
                            type: string
                            description: Task ID for tracking task status
                            examples:
                              - 5c79****be8e
                        x-apidog-orders:
                          - taskId
                        x-apidog-ignore-properties: []
                    x-apidog-orders:
                      - data
                    x-apidog-ignore-properties: []
          headers: {}
          x-apidog-name: ''
        '500':
          description: request failed
          content:
            application/json:
              schema:
                type: object
                properties:
                  code:
                    type: integer
                    description: >-
                      Response status code


                      - **200**: Success - Request has been processed
                      successfully

                      - **401**: Unauthorized - Authentication credentials are
                      missing or invalid

                      - **402**: Insufficient Credits - Account does not have
                      enough credits to perform the operation

                      - **404**: Not Found - The requested resource or endpoint
                      does not exist

                      - **422**: Validation Error - The request parameters
                      failed validation checks

                      - **429**: Rate Limited - Request limit has been exceeded
                      for this resource

                      - **455**: Service Unavailable - System is currently
                      undergoing maintenance

                      - **500**: Server Error - An unexpected error occurred
                      while processing the request

                      - **501**: Generation Failed - Content generation task
                      failed

                      - **505**: Feature Disabled - The requested feature is
                      currently disabled
                  msg:
                    type: string
                    description: Response message, error description when failed
                  data:
                    type: object
                    properties: {}
                    x-apidog-orders: []
                    x-apidog-ignore-properties: []
                x-apidog-orders:
                  - code
                  - msg
                  - data
                required:
                  - code
                  - msg
                  - data
                x-apidog-ignore-properties: []
              example:
                code: 500
                msg: >-
                  Server Error - An unexpected error occurred while processing
                  the request
                data: null
          headers: {}
          x-apidog-name: 'Error '
      security:
        - BearerAuth: []
          x-apidog:
            schemeGroups:
              - id: kn8M4YUlc5i0A0179ezwx
                schemeIds:
                  - BearerAuth
            required: true
            use:
              id: kn8M4YUlc5i0A0179ezwx
            scopes:
              kn8M4YUlc5i0A0179ezwx:
                BearerAuth: []
      callbacks:
        audioGenerated:
          '{request.body#/callBackUrl}':
            post:
              description: >-
                System will call this callback when audio generation is
                complete.


                ### Callback Example

                ```json

                {
                  "code": 200,
                  "msg": "All generated successfully.",
                  "data": {
                    "callbackType": "complete",
                    "task_id": "2fac****9f72",
                    "data": [
                      {
                        "id": "e231****-****-****-****-****8cadc7dc",
                        "audio_url": "https://example.cn/****.mp3",
                        "source_audio_url": "https://example.cn/****.mp3",
                        "stream_audio_url": "https://example.cn/****",
                        "source_stream_audio_url": "https://example.cn/****",
                        "image_url": "https://example.cn/****.jpeg",
                        "source_image_url": "https://example.cn/****.jpeg",
                        "prompt": "[Verse] Night city lights shining bright",
                        "model_name": "chirp-v3-5",
                        "title": "Iron Man",
                        "tags": "electrifying, rock",
                        "createTime": "2025-01-01 00:00:00",
                        "duration": 198.44
                      },
                      {
                        "id": "bd15****1873",
                        "audio_url": "https://example.cn/****.mp3",
                        "source_audio_url": "https://example.cn/****.mp3",
                        "stream_audio_url": "https://example.cn/****",
                        "source_stream_audio_url": "https://example.cn/****",
                        "image_url": "https://example.cn/****.jpeg",
                        "source_image_url": "https://example.cn/****.jpeg",
                        "prompt": "[Verse] Night city lights shining bright",
                        "model_name": "chirp-v3-5",
                        "title": "Iron Man",
                        "tags": "electrifying, rock",
                        "createTime": "2025-01-01 00:00:00",
                        "duration": 228.28
                      }
                    ]
                  }
                }

                ```
              requestBody:
                content:
                  application/json:
                    schema:
                      type: object
                      properties:
                        code:
                          type: integer
                          description: Status code
                          example: 200
                        msg:
                          type: string
                          description: Response message
                          example: All generated successfully
                        data:
                          type: object
                          properties:
                            callbackType:
                              type: string
                              description: >-
                                Callback type: text (text generation complete),
                                first (first track complete), complete (all
                                tracks complete)
                              enum:
                                - text
                                - first
                                - complete
                            task_id:
                              type: string
                              description: Task ID
                            data:
                              type: array
                              items:
                                type: object
                                properties:
                                  id:
                                    type: string
                                    description: Audio unique identifier (audioId)
                                  audio_url:
                                    type: string
                                    description: Audio file URL
                                  source_audio_url:
                                    type: string
                                    description: Original audio file URL
                                  stream_audio_url:
                                    type: string
                                    description: Streaming audio URL
                                  source_stream_audio_url:
                                    type: string
                                    description: Original streaming audio URL
                                  image_url:
                                    type: string
                                    description: Cover image URL
                                  source_image_url:
                                    type: string
                                    description: Original cover image URL
                                  prompt:
                                    type: string
                                    description: Generation prompt/lyrics
                                  model_name:
                                    type: string
                                    description: Model name used
                                  title:
                                    type: string
                                    description: Music title
                                  tags:
                                    type: string
                                    description: Music tags
                                  createTime:
                                    type: string
                                    description: Creation time
                                    format: date-time
                                  duration:
                                    type: number
                                    description: Audio duration (seconds)
              responses:
                '200':
                  description: Callback received successfully
                  content:
                    application/json:
                      schema:
                        allOf:
                          - type: object
                            properties:
                              code:
                                type: integer
                                enum:
                                  - 200
                                  - 400
                                  - 408
                                  - 413
                                  - 500
                                  - 501
                                  - 531
                                description: >-
                                  Response status code


                                  - **200**: Success - Request has been
                                  processed successfully

                                  - **400**: Validation Error - Lyrics contained
                                  copyrighted material.

                                  - **408**: Rate Limited - Timeout.

                                  - **413**: Conflict - Uploaded audio matches
                                  existing work of art.

                                  - **500**: Server Error - An unexpected error
                                  occurred while processing the request

                                  - **501**: Audio generation failed.

                                  - **531**: Server Error - Sorry, the
                                  generation failed due to an issue. Your
                                  credits have been refunded. Please try again.
                              msg:
                                type: string
                                description: Error message when code != 200
                                example: success
                      example:
                        code: 200
                        msg: success
      x-apidog-folder: docs/en/Market/Suno API/Music Generation
      x-apidog-status: released
      x-run-in-apidog: https://app.apidog.com/web/project/1184766/apis/api-28506285-run
components:
  schemas: {}
  securitySchemes:
    BearerAuth:
      type: bearer
      scheme: bearer
      bearerFormat: API Key
      description: |-
        所有 API 均需要通过 Bearer Token 进行身份验证。

        获取 API Key：
        1. 访问 [API Key 管理页面](https://kie.ai/api-key) 获取您的 API Key

        使用方法：
        在请求头中添加：
        Authorization: Bearer YOUR_API_KEY

        注意：
        - 请妥善保管您的 API Key，不要与他人分享
        - 如果您怀疑 API Key 已泄露，请立即在管理页面重置
servers:
  - url: https://api.kie.ai
    description: 正式环境
security:
  - BearerAuth: []
    x-apidog:
      schemeGroups:
        - id: kn8M4YUlc5i0A0179ezwx
          schemeIds:
            - BearerAuth
      required: true
      use:
        id: kn8M4YUlc5i0A0179ezwx
      scopes:
        kn8M4YUlc5i0A0179ezwx:
          BearerAuth: []

```


# ========== upload-and-extend-audio ==========

# Upload And Extend Audio

## OpenAPI Specification

```yaml
openapi: 3.0.1
info:
  title: ''
  description: ''
  version: 1.0.0
paths:
  /api/v1/generate/upload-extend:
    post:
      summary: Upload And Extend Audio
      deprecated: false
      description: >-
        > This API extends audio tracks while preserving their original style.
        It includes Suno's upload functionality, allowing users to upload audio
        files for processing. The expected result is a longer track that
        seamlessly continues the input style.


        ## Parameter Usage Guide


        :::note Character Limits

        Character limits vary depending on the model version:


        *   **Model V5**: `style` (max 1000 chars), `title` (max 100 chars),
        `prompt` (max 5000 chars)

        *   **Models V4.5PLUS and V4.5**: `style` (max 1000 chars), `title` (max
        100 chars), `prompt` (max 5000 chars)

        *   **Model V4.5ALL**: `style` (max 1000 chars), `title` (max 80 chars),
        `prompt` (max 5000 chars)

        *   **Model V4**: `style` (max 200 chars), `title` (max 80 chars),
        `prompt` (max 3000 chars)

        :::


        *   **When `defaultParamFlag` is `true` (Custom Parameters):**
            *   If `instrumental` is `true`: `style`, `title`, and `uploadUrl` are required.
            *   If `instrumental` is `false`: `style`, `prompt`, `title`, and `uploadUrl` are required.
            *   **Character limits vary by model version** (see note above).
            *   `continueAt`: The time point in seconds from which to start extending (must be greater than 0 and less than the uploaded audio duration).
            *   `uploadUrl`: Specifies the upload location for audio files; ensure uploaded audio does not exceed 8 minutes.

        *   **When `defaultParamFlag` is `false` (Default Parameters):**
            *   Regardless of the `instrumental` setting, only `uploadUrl` and `prompt` are required.
            *   Other parameters will use the original audio's parameters.

        ## Developer Notes


        1.  Generated files will be retained for **14 days**.

        2.  The model version used must be consistent with the source music's
        model version.

        3.  This feature is ideal for creating longer works by extending
        existing music.

        4.  The `uploadUrl` parameter specifies the upload location for audio
        files; provide a valid URL.


        ## Optional Parameters


        *   `vocalGender` (`string`): Vocal gender preference. Use `m` for male,
        `f` for female.

        *   `styleWeight` (`number`): Strength of adherence to the style. Range
        0–1, up to 2 decimal places. Example: `0.65`.

        *   `weirdnessConstraint` (`number`): Controls creative deviation. Range
        0–1, up to 2 decimal places. Example: `0.65`.

        *   `audioWeight` (`number`): Balance weight for audio features. Range
        0–1, up to 2 decimal places. Example: `0.65`.

        *   `personaId` (`string`): Persona ID to apply to the generated music.
        Only available when Custom Mode is enabled (i.e., `defaultParamFlag` is
        `true`). To create one, use [Generate
        Persona](https://docs.kie.ai/suno-api/generate-persona).
      operationId: upload-and-extend-audio
      tags:
        - docs/en/Market/Suno API/Music Generation
      parameters: []
      requestBody:
        content:
          application/json:
            schema:
              type: object
              required:
                - uploadUrl
                - defaultParamFlag
                - instrumental
                - continueAt
                - model
                - callBackUrl
              properties:
                uploadUrl:
                  type: string
                  format: uri
                  description: >-
                    The URL for uploading audio files, required regardless of
                    whether defaultParamFlag is true or false. Ensure the
                    uploaded audio does not exceed 8 minutes in length.
                  examples:
                    - https://storage.example.com/upload
                defaultParamFlag:
                  type: boolean
                  description: >-
                    Enable custom mode for advanced audio generation settings.  

                    - Set to `true` to use custom parameter mode (requires
                    `style`, `title`, and `uploadUrl`; if `instrumental` is
                    `false`, `uploadUrl` and `prompt` are required). If
                    `instrumental` is `false`, the prompt will be strictly used
                    as lyrics.  

                    - Set to `false` to use non-custom mode (only `uploadUrl`
                    required). Lyrics will be automatically generated based on
                    the prompt.
                  examples:
                    - true
                instrumental:
                  type: boolean
                  description: >-
                    Determines whether the audio is instrumental (without
                    lyrics).  

                    - In custom parameter mode (`customMode: true`):  
                      - If `true`: only `style`, `title`, and `uploadUrl` are required.  
                      - If `false`: `style`, `title`, `prompt` (`prompt` will be used as exact lyrics), and `uploadUrl` are required.  
                    - In non-custom parameter mode (`defaultParamFlag: false`):
                    does not affect required fields (only `uploadUrl` needed).
                    If `false`, lyrics will be automatically generated.
                  examples:
                    - true
                prompt:
                  type: string
                  description: >-
                    Description of how the music should be extended. Required
                    when defaultParamFlag is true. Character limits by model:  

                    - **V5**: Maximum 5000 characters  

                    - **V4_5PLUS & V4_5**: Maximum 5000 characters  

                    - **V4_5ALL**: Maximum 5000 characters  

                    - **V4**: Maximum 3000 characters
                  examples:
                    - Extend the music with more relaxing notes
                style:
                  type: string
                  description: >-
                    Music style, e.g., Jazz, Classical, Electronic. Character
                    limits by model:  

                    - **V5**: Maximum 1000 characters  

                    - **V4_5PLUS & V4_5**: Maximum 1000 characters  

                    - **V4_5ALL**: Maximum 1000 characters  

                    - **V4**: Maximum 200 characters
                  examples:
                    - Classical
                title:
                  type: string
                  description: |-
                    Music title. Character limits by model:  
                    - **V5**: Maximum 100 characters  
                    - **V4_5PLUS & V4_5**: Maximum 100 characters  
                    - **V4_5ALL**: Maximum 80 characters  
                    - **V4**: Maximum 80 characters
                  examples:
                    - Peaceful Piano Extended
                continueAt:
                  type: number
                  description: >-
                    The time point (in seconds) from which to start extending
                    the music.  

                    - Required when `defaultParamFlag` is `true`.  

                    - Value range: greater than 0 and less than the total
                    duration of the uploaded audio.  

                    - Specifies the position in the original track where the
                    extension should begin.
                  examples:
                    - 60
                model:
                  type: string
                  description: |-
                    The AI model version to use for generation.  
                    - Required for all requests.  
                    - Available options:  
                      - **`V5`**: Superior musical expression, faster generation.  
                      - **`V4_5PLUS`**: V4.5+ delivers richer sound, new ways to create, max 8 min.  
                      - **`V4_5`**: V4.5 enables smarter prompts, faster generations, max 8 min.  
                      - **`V4_5ALL`**: V4.5ALL enables smarter prompts, faster generations, max 8 min.  
                      - **`V4`**: V4 improves vocal quality, max 4 min.
                  enum:
                    - V4
                    - V4_5
                    - V4_5PLUS
                    - V4_5ALL
                    - V5
                  examples:
                    - V4
                negativeTags:
                  type: string
                  description: Music styles to exclude from generation
                  examples:
                    - Relaxing Piano
                callBackUrl:
                  type: string
                  format: uri
                  description: >-
                    The URL to receive audio extension task completion updates.
                    Required for all audio extension requests.


                    - System will POST task status and results to this URL when
                    audio extension completes

                    - Callback includes extended audio files that seamlessly
                    continue the uploaded track's style

                    - Your callback endpoint should accept POST requests with
                    JSON payload containing extended track results and audio
                    URLs

                    - For detailed callback format and implementation guide, see
                    [Audio Extension
                    Callbacks](https://docs.kie.ai/suno-api/upload-and-extend-audio-callbacks)

                    - Alternatively, use the Get Music Details endpoint to poll
                    task status

                    - To ensure callback security, see [Webhook Verification
                    Guide](/common-api/webhook-verification) for signature
                    verification implementation
                  examples:
                    - https://api.example.com/callback
                vocalGender:
                  type: string
                  description: >-
                    Vocal gender preference for the singing voice. Optional. Use
                    'm' for male and 'f' for female. Based on practice, this
                    parameter can only increase the probability but cannot
                    guarantee adherence to male/female voice instructions.
                  enum:
                    - m
                    - f
                  examples:
                    - m
                styleWeight:
                  type: number
                  description: >-
                    Strength of adherence to the specified style. Optional.
                    Range 0–1, up to 2 decimal places.
                  minimum: 0
                  maximum: 1
                  multipleOf: 0.01
                  examples:
                    - 0.65
                weirdnessConstraint:
                  type: number
                  description: >-
                    Controls experimental/creative deviation. Optional. Range
                    0–1, up to 2 decimal places.
                  minimum: 0
                  maximum: 1
                  multipleOf: 0.01
                  examples:
                    - 0.65
                audioWeight:
                  type: number
                  description: >-
                    Balance weight for audio features vs. other factors.
                    Optional. Range 0–1, up to 2 decimal places.
                  minimum: 0
                  maximum: 1
                  multipleOf: 0.01
                  examples:
                    - 0.65
                personaId:
                  type: string
                  description: >-
                    Only available when Custom Mode (`defaultParamFlag: true`)
                    is enabled. Persona ID to apply to the generated music.
                    Optional. Use this to apply a specific persona style to your
                    music generation. 


                    To generate a persona ID, use the [Generate
                    Persona](https://docs.kie.ai/suno-api/generate-persona)
                    endpoint to create a personalized music Persona based on
                    generated music.
                  examples:
                    - persona_123
              x-apidog-orders:
                - uploadUrl
                - defaultParamFlag
                - instrumental
                - prompt
                - style
                - title
                - continueAt
                - model
                - negativeTags
                - callBackUrl
                - vocalGender
                - styleWeight
                - weirdnessConstraint
                - audioWeight
                - personaId
                - 01KH5V4EJ53J4835SRBTS01PZG
              x-apidog-refs:
                01KH5V4EJ53J4835SRBTS01PZG:
                  type: object
                  properties: {}
              x-apidog-ignore-properties: []
            example:
              uploadUrl: https://storage.example.com/upload
              defaultParamFlag: true
              instrumental: true
              continueAt: 60
              model: V4
              callBackUrl: https://api.example.com/callback
              prompt: Extend the music with more relaxing notes
              style: Classical
              title: Peaceful Piano Extended
              negativeTags: Relaxing Piano
              vocalGender: m
              styleWeight: 0.65
              weirdnessConstraint: 0.65
              audioWeight: 0.65
              personaId: persona_123
              personaModel: style_persona
      responses:
        '200':
          description: Request successful
          content:
            application/json:
              schema:
                allOf:
                  - type: object
                    properties:
                      code:
                        type: integer
                        enum:
                          - 200
                          - 401
                          - 402
                          - 404
                          - 409
                          - 422
                          - 429
                          - 451
                          - 455
                          - 500
                        description: >-
                          Response status code


                          - **200**: Success - Request has been processed
                          successfully

                          - **401**: Unauthorized - Authentication credentials
                          are missing or invalid

                          - **402**: Insufficient Credits - Account does not
                          have enough credits to perform the operation

                          - **404**: Not Found - The requested resource or
                          endpoint does not exist

                          - **409**: Conflict - WAV record already exists

                          - **422**: Validation Error - The request parameters
                          failed validation checks

                          - **429**: Rate Limited - Request limit has been
                          exceeded for this resource

                          - **451**: Unauthorized - Failed to fetch the image.
                          Kindly verify any access limits set by you or your
                          service provider.

                          - **455**: Service Unavailable - System is currently
                          undergoing maintenance

                          - **500**: Server Error - An unexpected error occurred
                          while processing the request
                      msg:
                        type: string
                        description: Error message when code != 200
                        examples:
                          - success
                    x-apidog-orders:
                      - code
                      - msg
                    x-apidog-ignore-properties: []
                  - type: object
                    properties:
                      data:
                        type: object
                        properties:
                          taskId:
                            type: string
                            description: Task ID for tracking task status
                            examples:
                              - 5c79****be8e
                        x-apidog-orders:
                          - taskId
                        x-apidog-ignore-properties: []
                    x-apidog-orders:
                      - data
                    x-apidog-ignore-properties: []
          headers: {}
          x-apidog-name: ''
        '500':
          description: request failed
          content:
            application/json:
              schema:
                type: object
                properties:
                  code:
                    type: integer
                    description: >-
                      Response status code


                      - **200**: Success - Request has been processed
                      successfully

                      - **401**: Unauthorized - Authentication credentials are
                      missing or invalid

                      - **402**: Insufficient Credits - Account does not have
                      enough credits to perform the operation

                      - **404**: Not Found - The requested resource or endpoint
                      does not exist

                      - **422**: Validation Error - The request parameters
                      failed validation checks

                      - **429**: Rate Limited - Request limit has been exceeded
                      for this resource

                      - **455**: Service Unavailable - System is currently
                      undergoing maintenance

                      - **500**: Server Error - An unexpected error occurred
                      while processing the request

                      - **501**: Generation Failed - Content generation task
                      failed

                      - **505**: Feature Disabled - The requested feature is
                      currently disabled
                  msg:
                    type: string
                    description: Response message, error description when failed
                  data:
                    type: object
                    properties: {}
                    x-apidog-orders: []
                    x-apidog-ignore-properties: []
                x-apidog-orders:
                  - code
                  - msg
                  - data
                required:
                  - code
                  - msg
                  - data
                x-apidog-ignore-properties: []
              example:
                code: 500
                msg: >-
                  Server Error - An unexpected error occurred while processing
                  the request
                data: null
          headers: {}
          x-apidog-name: 'Error '
      security:
        - BearerAuth: []
          x-apidog:
            schemeGroups:
              - id: kn8M4YUlc5i0A0179ezwx
                schemeIds:
                  - BearerAuth
            required: true
            use:
              id: kn8M4YUlc5i0A0179ezwx
            scopes:
              kn8M4YUlc5i0A0179ezwx:
                BearerAuth: []
      callbacks:
        audioExtend:
          '{$request.body#/callBackUrl}':
            post:
              description: >-
                System will call this callback when audio generation is
                complete.


                ### Callback Example

                ```json

                {
                  "code": 200,
                  "msg": "All generated successfully.",
                  "data": {
                    "callbackType": "complete",
                    "task_id": "2fac****9f72",
                    "data": [
                      {
                        "id": "e231****-****-****-****-****8cadc7dc",
                        "audio_url": "https://example.cn/****.mp3",
                        "source_audio_url": "https://example.cn/****.mp3",
                        "stream_audio_url": "https://example.cn/****",
                        "source_stream_audio_url": "https://example.cn/****",
                        "image_url": "https://example.cn/****.jpeg",
                        "source_image_url": "https://example.cn/****.jpeg",
                        "prompt": "[Verse] Night city lights shining bright",
                        "model_name": "chirp-v3-5",
                        "title": "Iron Man",
                        "tags": "electrifying, rock",
                        "createTime": "2025-01-01 00:00:00",
                        "duration": 198.44
                      }
                    ]
                  }
                }

                ```
              requestBody:
                content:
                  application/json:
                    schema:
                      type: object
                      properties:
                        code:
                          type: integer
                          description: Status code
                          example: 200
                        msg:
                          type: string
                          description: Response message
                          example: All generated successfully
                        data:
                          type: object
                          properties:
                            callbackType:
                              type: string
                              description: >-
                                Callback type: text (text generation complete),
                                first (first track complete), complete (all
                                tracks complete)
                              enum:
                                - text
                                - first
                                - complete
                            task_id:
                              type: string
                              description: Task ID
                            data:
                              type: array
                              items:
                                type: object
                                properties:
                                  id:
                                    type: string
                                    description: Audio unique identifier (audioId)
                                  audio_url:
                                    type: string
                                    description: Audio file URL
                                  source_audio_url:
                                    type: string
                                    description: Original audio file URL
                                  stream_audio_url:
                                    type: string
                                    description: Streaming audio URL
                                  source_stream_audio_url:
                                    type: string
                                    description: Original streaming audio URL
                                  image_url:
                                    type: string
                                    description: Cover image URL
                                  source_image_url:
                                    type: string
                                    description: Original cover image URL
                                  prompt:
                                    type: string
                                    description: Generation prompt/lyrics
                                  model_name:
                                    type: string
                                    description: Model name used
                                  title:
                                    type: string
                                    description: Music title
                                  tags:
                                    type: string
                                    description: Music tags
                                  createTime:
                                    type: string
                                    description: Creation time
                                    format: date-time
                                  duration:
                                    type: number
                                    description: Audio duration (seconds)
              responses:
                '200':
                  description: Callback received successfully
                  content:
                    application/json:
                      schema:
                        allOf:
                          - type: object
                            properties:
                              code:
                                type: integer
                                enum:
                                  - 200
                                  - 400
                                  - 408
                                  - 413
                                  - 500
                                  - 501
                                  - 531
                                description: >-
                                  Response status code


                                  - **200**: Success - Request has been
                                  processed successfully

                                  - **400**: Validation Error - Lyrics contained
                                  copyrighted material.

                                  - **408**: Rate Limited - Timeout.

                                  - **413**: Conflict - Uploaded audio matches
                                  existing work of art.

                                  - **500**: Server Error - An unexpected error
                                  occurred while processing the request

                                  - **501**: Audio generation failed.

                                  - **531**: Server Error - Sorry, the
                                  generation failed due to an issue. Your
                                  credits have been refunded. Please try again.
                              msg:
                                type: string
                                description: Error message when code != 200
                                example: success
                      example:
                        code: 200
                        msg: success
      x-apidog-folder: docs/en/Market/Suno API/Music Generation
      x-apidog-status: released
      x-run-in-apidog: https://app.apidog.com/web/project/1184766/apis/api-28506286-run
components:
  schemas: {}
  securitySchemes:
    BearerAuth:
      type: bearer
      scheme: bearer
      bearerFormat: API Key
      description: |-
        所有 API 均需要通过 Bearer Token 进行身份验证。

        获取 API Key：
        1. 访问 [API Key 管理页面](https://kie.ai/api-key) 获取您的 API Key

        使用方法：
        在请求头中添加：
        Authorization: Bearer YOUR_API_KEY

        注意：
        - 请妥善保管您的 API Key，不要与他人分享
        - 如果您怀疑 API Key 已泄露，请立即在管理页面重置
servers:
  - url: https://api.kie.ai
    description: 正式环境
security:
  - BearerAuth: []
    x-apidog:
      schemeGroups:
        - id: kn8M4YUlc5i0A0179ezwx
          schemeIds:
            - BearerAuth
      required: true
      use:
        id: kn8M4YUlc5i0A0179ezwx
      scopes:
        kn8M4YUlc5i0A0179ezwx:
          BearerAuth: []

```


# ========== add-instrumental ==========

# Add Instrumental to Music

## OpenAPI Specification

```yaml
openapi: 3.0.1
info:
  title: ''
  description: ''
  version: 1.0.0
paths:
  /api/v1/generate/add-instrumental:
    post:
      summary: Add Instrumental to Music
      deprecated: false
      description: >-
        Generate instrumental accompaniment based on uploaded audio files. This
        interface allows you to upload audio files and add instrumental tracks
        to them.


        ### Usage Guide

        - Use this interface to add instrumental tracks to existing audio

        - Supports generation of various music style accompaniments

        - Allows customization of style, exclusion of specific elements, etc.


        ### Parameter Details

        - `uploadUrl` specifies the audio file URL to be processed

        - `title` specifies the title for the generated music

        - `tags` and `negativeTags` are used to control music style

        - Supports various optional parameters for fine-tuning generation
        effects


        ### Developer Notes

        - Generated files will be retained for 14 days

        - Callback process has three stages: `text` (text generation), `first`
        (first track completed), `complete` (all completed)
      operationId: add-instrumental
      tags:
        - docs/en/Market/Suno API/Music Generation
      parameters: []
      requestBody:
        content:
          application/json:
            schema:
              type: object
              required:
                - uploadUrl
                - title
                - negativeTags
                - tags
                - callBackUrl
              properties:
                uploadUrl:
                  type: string
                  format: uri
                  description: >-
                    URL of the uploaded audio file. Specifies the source audio
                    file location for adding accompaniment.
                  examples:
                    - https://example.com/music.mp3
                model:
                  type: string
                  description: |-
                    The AI model version to use for generation.   
                    - Available options: 
                      - **`V5`**: Superior musical expression, faster generation.  
                      - **`V4_5PLUS`**: V4.5+ is richer sound, new ways to create.  
                  enum:
                    - V4_5PLUS
                    - V5
                  default: V4_5PLUS
                  examples:
                    - V4_5PLUS
                title:
                  type: string
                  description: >-
                    Title of the generated music. Will be displayed in the
                    player interface and file name.
                  examples:
                    - Relaxing Piano
                negativeTags:
                  type: string
                  description: >-
                    Music styles or characteristics to exclude from the
                    generated audio. Used to avoid specific unwanted music
                    elements.
                  examples:
                    - heavy metal, fast drums
                tags:
                  type: string
                  description: >-
                    Music styles or tags to include in the generated music.
                    Defines the desired music style and characteristics.
                  examples:
                    - relaxing, piano, soothing
                callBackUrl:
                  type: string
                  format: uri
                  description: >-
                    URL address for receiving instrumental generation task
                    completion updates. This parameter is required for all
                    instrumental generation requests.


                    - The system will send a POST request to this URL when
                    instrumental generation is completed, including task status
                    and results

                    - Callback process has three stages: `text` (text
                    generation), `first` (first track completed), `complete`
                    (all completed)

                    - Your callback endpoint should be able to accept POST
                    requests containing JSON payloads with music generation
                    results

                    - Alternatively, you can use the get music details interface
                    to poll task status

                    - To ensure callback security, see [Webhook Verification
                    Guide](/common-api/webhook-verification) for signature
                    verification implementation
                  examples:
                    - https://example.com/callback
                vocalGender:
                  type: string
                  description: >-
                    Vocal gender preference. Optional. 'm' for male, 'f' for
                    female. Based on practice, this parameter can only increase
                    the probability but cannot guarantee adherence to
                    male/female voice instructions.
                  enum:
                    - m
                    - f
                  examples:
                    - m
                styleWeight:
                  type: number
                  description: >-
                    Adherence strength to specified style. Optional. Range 0–1,
                    up to 2 decimal places.
                  minimum: 0
                  maximum: 1
                  multipleOf: 0.01
                  examples:
                    - 0.61
                weirdnessConstraint:
                  type: number
                  description: >-
                    Controls experimental/creative deviation level. Optional.
                    Range 0–1, up to 2 decimal places.
                  minimum: 0
                  maximum: 1
                  multipleOf: 0.01
                  examples:
                    - 0.72
                audioWeight:
                  type: number
                  description: >-
                    Relative weight of audio elements. Optional. Range 0–1, up
                    to 2 decimal places.
                  minimum: 0
                  maximum: 1
                  multipleOf: 0.01
                  examples:
                    - 0.65
              x-apidog-orders:
                - uploadUrl
                - model
                - title
                - negativeTags
                - tags
                - callBackUrl
                - vocalGender
                - styleWeight
                - weirdnessConstraint
                - audioWeight
              x-apidog-ignore-properties: []
            example:
              uploadUrl: https://example.com/music.mp3
              title: Relaxing Piano
              negativeTags: heavy metal, fast drums
              tags: relaxing, piano, soothing
              callBackUrl: https://example.com/callback
              model: V4_5PLUS
              vocalGender: m
              styleWeight: 0.61
              weirdnessConstraint: 0.72
              audioWeight: 0.65
      responses:
        '200':
          description: Request successful
          content:
            application/json:
              schema:
                allOf:
                  - type: object
                    properties:
                      code:
                        type: integer
                        enum:
                          - 200
                          - 401
                          - 402
                          - 404
                          - 409
                          - 422
                          - 429
                          - 451
                          - 455
                          - 500
                        description: >-
                          Response status code


                          - **200**: Success - Request processed successfully

                          - **401**: Unauthorized - Authentication credentials
                          missing or invalid

                          - **402**: Insufficient credits - Account does not
                          have enough credits to perform this operation

                          - **404**: Not found - Requested resource or endpoint
                          does not exist

                          - **409**: Conflict - WAV record already exists

                          - **422**: Validation error - Request parameters
                          failed validation checks

                          - **429**: Rate limit exceeded - Request limit for
                          this resource has been exceeded

                          - **451**: Unauthorized - Failed to retrieve image.
                          Please verify any access restrictions set by you or
                          your service provider.

                          - **455**: Service unavailable - System currently
                          undergoing maintenance

                          - **500**: Server error - Unexpected error occurred
                          while processing request
                      msg:
                        type: string
                        description: Error message when code != 200
                        examples:
                          - success
                    x-apidog-orders:
                      - code
                      - msg
                    x-apidog-ignore-properties: []
                  - type: object
                    properties:
                      data:
                        type: object
                        properties:
                          taskId:
                            type: string
                            description: >-
                              Task ID for tracking task status. You can use this
                              ID to query task details and results through the
                              "Get Music Details" interface.
                            examples:
                              - 5c79****be8e
                        x-apidog-orders:
                          - taskId
                        x-apidog-ignore-properties: []
                    x-apidog-orders:
                      - data
                    x-apidog-ignore-properties: []
          headers: {}
          x-apidog-name: ''
        '500':
          description: request failed
          content:
            application/json:
              schema:
                type: object
                properties:
                  code:
                    type: integer
                    description: >-
                      Response status code


                      - **200**: Success - Request has been processed
                      successfully

                      - **401**: Unauthorized - Authentication credentials are
                      missing or invalid

                      - **402**: Insufficient Credits - Account does not have
                      enough credits to perform the operation

                      - **404**: Not Found - The requested resource or endpoint
                      does not exist

                      - **422**: Validation Error - The request parameters
                      failed validation checks

                      - **429**: Rate Limited - Request limit has been exceeded
                      for this resource

                      - **455**: Service Unavailable - System is currently
                      undergoing maintenance

                      - **500**: Server Error - An unexpected error occurred
                      while processing the request

                      - **501**: Generation Failed - Content generation task
                      failed

                      - **505**: Feature Disabled - The requested feature is
                      currently disabled
                  msg:
                    type: string
                    description: Response message, error description when failed
                  data:
                    type: object
                    properties: {}
                    x-apidog-orders: []
                    x-apidog-ignore-properties: []
                x-apidog-orders:
                  - code
                  - msg
                  - data
                required:
                  - code
                  - msg
                  - data
                x-apidog-ignore-properties: []
              example:
                code: 500
                msg: >-
                  Server Error - An unexpected error occurred while processing
                  the request
                data: null
          headers: {}
          x-apidog-name: 'Error '
      security:
        - BearerAuth: []
          x-apidog:
            schemeGroups:
              - id: kn8M4YUlc5i0A0179ezwx
                schemeIds:
                  - BearerAuth
            required: true
            use:
              id: kn8M4YUlc5i0A0179ezwx
            scopes:
              kn8M4YUlc5i0A0179ezwx:
                BearerAuth: []
      callbacks:
        audioGenerated:
          '{request.body#/callBackUrl}':
            post:
              description: >-
                When instrumental generation is completed, the system will call
                this callback to notify the results.


                ### Callback Example

                ```json

                {
                  "code": 200,
                  "msg": "All generated successfully.",
                  "data": {
                    "callbackType": "complete",
                    "task_id": "2fac****9f72",
                    "data": [
                      {
                        "id": "e231****-****-****-****-****8cadc7dc",
                        "audio_url": "https://example.cn/****.mp3",
                        "stream_audio_url": "https://example.cn/****",
                        "image_url": "https://example.cn/****.jpeg",
                        "prompt": "[Verse] Night city lights shining bright",
                        "model_name": "chirp-v4-5",
                        "title": "Iron Man",
                        "tags": "electrifying, rock",
                        "createTime": "2025-01-01 00:00:00",
                        "duration": 198.44
                      }
                    ]
                  }
                }

                ```
              requestBody:
                content:
                  application/json:
                    schema:
                      type: object
                      properties:
                        code:
                          type: integer
                          description: Status code
                          example: 200
                        msg:
                          type: string
                          description: Return message
                          example: All generated successfully
                        data:
                          type: object
                          properties:
                            callbackType:
                              type: string
                              description: >-
                                Callback type: text (text generation completed),
                                first (first track completed), complete (all
                                completed)
                              enum:
                                - text
                                - first
                                - complete
                            task_id:
                              type: string
                              description: Task ID
                            data:
                              type: array
                              items:
                                type: object
                                properties:
                                  id:
                                    type: string
                                    description: Audio unique identifier (audioId)
                                  audio_url:
                                    type: string
                                    description: Audio file URL
                                  stream_audio_url:
                                    type: string
                                    description: Streaming audio URL
                                  image_url:
                                    type: string
                                    description: Cover image URL
                                  prompt:
                                    type: string
                                    description: Generation prompt/lyrics
                                  model_name:
                                    type: string
                                    description: Model name used
                                  title:
                                    type: string
                                    description: Music title
                                  tags:
                                    type: string
                                    description: Music tags
                                  createTime:
                                    type: string
                                    description: Creation time
                                    format: date-time
                                  duration:
                                    type: number
                                    description: Audio duration (seconds)
              responses:
                '200':
                  description: Callback received successfully
                  content:
                    application/json:
                      schema:
                        allOf:
                          - type: object
                            properties:
                              code:
                                type: integer
                                enum:
                                  - 200
                                  - 400
                                  - 408
                                  - 413
                                  - 500
                                  - 501
                                  - 531
                                description: >-
                                  Response status code


                                  - **200**: Success - Request processed
                                  successfully

                                  - **400**: Validation error - Lyrics contain
                                  copyrighted content.

                                  - **408**: Rate limit exceeded - Timeout.

                                  - **413**: Conflict - Uploaded audio matches
                                  existing artwork.

                                  - **500**: Server error - Unexpected error
                                  occurred while processing request

                                  - **501**: Audio generation failed.

                                  - **531**: Server error - Sorry, generation
                                  failed due to issues. Your credits have been
                                  refunded. Please try again.
                              msg:
                                type: string
                                description: Error message when code != 200
                                example: success
                      example:
                        code: 200
                        msg: success
      x-apidog-folder: docs/en/Market/Suno API/Music Generation
      x-apidog-status: released
      x-run-in-apidog: https://app.apidog.com/web/project/1184766/apis/api-28506287-run
components:
  schemas: {}
  securitySchemes:
    BearerAuth:
      type: bearer
      scheme: bearer
      bearerFormat: API Key
      description: |-
        所有 API 均需要通过 Bearer Token 进行身份验证。

        获取 API Key：
        1. 访问 [API Key 管理页面](https://kie.ai/api-key) 获取您的 API Key

        使用方法：
        在请求头中添加：
        Authorization: Bearer YOUR_API_KEY

        注意：
        - 请妥善保管您的 API Key，不要与他人分享
        - 如果您怀疑 API Key 已泄露，请立即在管理页面重置
servers:
  - url: https://api.kie.ai
    description: 正式环境
security:
  - BearerAuth: []
    x-apidog:
      schemeGroups:
        - id: kn8M4YUlc5i0A0179ezwx
          schemeIds:
            - BearerAuth
      required: true
      use:
        id: kn8M4YUlc5i0A0179ezwx
      scopes:
        kn8M4YUlc5i0A0179ezwx:
          BearerAuth: []

```


# ========== add-vocals ==========

# Add Vocals to Music

## OpenAPI Specification

```yaml
openapi: 3.0.1
info:
  title: ''
  description: ''
  version: 1.0.0
paths:
  /api/v1/generate/add-vocals:
    post:
      summary: Add Vocals to Music
      deprecated: false
      description: >-
        Generate music with vocals based on uploaded audio files. This interface
        allows you to upload audio files and add vocal singing to them.


        ### Usage Guide

        - Use this interface to add vocal singing to existing audio

        - Supports custom lyric content and singing styles

        - Allows control of vocal gender, style weight, and other parameters


        ### Parameter Details

        - `uploadUrl` specifies the audio file URL to be processed

        - `prompt` defines lyric content and singing style

        - `style` and `negativeTags` are used to control music and vocal style

        - Supports various optional parameters for fine-tuning generation
        effects


        ### Developer Notes

        - Generated files will be retained for 14 days

        - Callback process has three stages: `text` (text generation), `first`
        (first track completed), `complete` (all completed)
      operationId: add-vocals
      tags:
        - docs/en/Market/Suno API/Music Generation
      parameters: []
      requestBody:
        content:
          application/json:
            schema:
              type: object
              required:
                - prompt
                - title
                - negativeTags
                - style
                - uploadUrl
                - callBackUrl
              properties:
                prompt:
                  type: string
                  description: >-
                    Prompt for generating audio. Usually text describing audio
                    content, used to guide vocal singing content and style.
                  examples:
                    - A calm and relaxing piano track.
                model:
                  type: string
                  description: |-
                    The AI model version to use for generation.    
                    - Available options: 
                      - **`V5`**: Superior musical expression, faster generation.  
                      - **`V4_5PLUS`**: V4.5+ is richer sound, new ways to create.  
                  enum:
                    - V4_5PLUS
                    - V5
                  default: V4_5PLUS
                  examples:
                    - V4_5PLUS
                title:
                  type: string
                  description: >-
                    Music title. Will be displayed in the player interface and
                    file name.
                  examples:
                    - Relaxing Piano
                negativeTags:
                  type: string
                  description: >-
                    Excluded music styles. Used to avoid including specific
                    styles or elements in the generated music.
                  examples:
                    - heavy metal, strong drum beats
                style:
                  type: string
                  description: >-
                    Music style. Such as jazz, electronic, classical and other
                    music types.
                  examples:
                    - Jazz
                vocalGender:
                  type: string
                  description: >-
                    Vocal gender preference. Optional. 'm' for male, 'f' for
                    female. Based on practice, this parameter can only increase
                    the probability but cannot guarantee adherence to
                    male/female voice instructions.
                  enum:
                    - m
                    - f
                  examples:
                    - m
                styleWeight:
                  type: number
                  description: >-
                    Adherence strength to specified style. Optional. Range 0–1,
                    up to 2 decimal places.
                  minimum: 0
                  maximum: 1
                  multipleOf: 0.01
                  examples:
                    - 0.61
                weirdnessConstraint:
                  type: number
                  description: >-
                    Controls experimental/creative deviation level. Optional.
                    Range 0–1, up to 2 decimal places.
                  minimum: 0
                  maximum: 1
                  multipleOf: 0.01
                  examples:
                    - 0.72
                audioWeight:
                  type: number
                  description: >-
                    Relative weight of audio elements. Optional. Range 0–1, up
                    to 2 decimal places.
                  minimum: 0
                  maximum: 1
                  multipleOf: 0.01
                  examples:
                    - 0.65
                uploadUrl:
                  type: string
                  format: uri
                  description: >-
                    URL of the uploaded audio file. Specifies the source audio
                    file location for adding vocals.
                  examples:
                    - https://example.com/music.mp3
                callBackUrl:
                  type: string
                  format: uri
                  description: >-
                    URL address for receiving vocal generation task completion
                    updates. This parameter is required for all vocal generation
                    requests.


                    - The system will send a POST request to this URL when vocal
                    generation is completed, including task status and results

                    - Callback process has three stages: `text` (text
                    generation), `first` (first track completed), `complete`
                    (all completed)

                    - Your callback endpoint should be able to accept POST
                    requests containing JSON payloads with music generation
                    results

                    - Alternatively, you can use the get music details interface
                    to poll task status

                    - To ensure callback security, see [Webhook Verification
                    Guide](/common-api/webhook-verification) for signature
                    verification implementation
                  examples:
                    - https://example.com/callback
              x-apidog-orders:
                - prompt
                - model
                - title
                - negativeTags
                - style
                - vocalGender
                - styleWeight
                - weirdnessConstraint
                - audioWeight
                - uploadUrl
                - callBackUrl
              x-apidog-ignore-properties: []
            example:
              prompt: A calm and relaxing piano track.
              title: Relaxing Piano
              negativeTags: heavy metal, strong drum beats
              style: Jazz
              uploadUrl: https://example.com/music.mp3
              callBackUrl: https://example.com/callback
              model: V4_5PLUS
              vocalGender: m
              styleWeight: 0.61
              weirdnessConstraint: 0.72
              audioWeight: 0.65
      responses:
        '200':
          description: Request successful
          content:
            application/json:
              schema:
                allOf:
                  - type: object
                    properties:
                      code:
                        type: integer
                        enum:
                          - 200
                          - 401
                          - 402
                          - 404
                          - 409
                          - 422
                          - 429
                          - 451
                          - 455
                          - 500
                        description: >-
                          Response status code


                          - **200**: Success - Request processed successfully

                          - **401**: Unauthorized - Authentication credentials
                          missing or invalid

                          - **402**: Insufficient credits - Account does not
                          have enough credits to perform this operation

                          - **404**: Not found - Requested resource or endpoint
                          does not exist

                          - **409**: Conflict - WAV record already exists

                          - **422**: Validation error - Request parameters
                          failed validation checks

                          - **429**: Rate limit exceeded - Request limit for
                          this resource has been exceeded

                          - **451**: Unauthorized - Failed to retrieve image.
                          Please verify any access restrictions set by you or
                          your service provider.

                          - **455**: Service unavailable - System currently
                          undergoing maintenance

                          - **500**: Server error - Unexpected error occurred
                          while processing request
                      msg:
                        type: string
                        description: Error message when code != 200
                        examples:
                          - success
                    x-apidog-orders:
                      - code
                      - msg
                    x-apidog-ignore-properties: []
                  - type: object
                    properties:
                      data:
                        type: object
                        properties:
                          taskId:
                            type: string
                            description: >-
                              Task ID for tracking task status. You can use this
                              ID to query task details and results through the
                              "Get Music Details" interface.
                            examples:
                              - 5c79****be8e
                        x-apidog-orders:
                          - taskId
                        x-apidog-ignore-properties: []
                    x-apidog-orders:
                      - data
                    x-apidog-ignore-properties: []
          headers: {}
          x-apidog-name: ''
        '500':
          description: request failed
          content:
            application/json:
              schema:
                type: object
                properties:
                  code:
                    type: integer
                    description: >-
                      Response status code


                      - **200**: Success - Request has been processed
                      successfully

                      - **401**: Unauthorized - Authentication credentials are
                      missing or invalid

                      - **402**: Insufficient Credits - Account does not have
                      enough credits to perform the operation

                      - **404**: Not Found - The requested resource or endpoint
                      does not exist

                      - **422**: Validation Error - The request parameters
                      failed validation checks

                      - **429**: Rate Limited - Request limit has been exceeded
                      for this resource

                      - **455**: Service Unavailable - System is currently
                      undergoing maintenance

                      - **500**: Server Error - An unexpected error occurred
                      while processing the request

                      - **501**: Generation Failed - Content generation task
                      failed

                      - **505**: Feature Disabled - The requested feature is
                      currently disabled
                  msg:
                    type: string
                    description: Response message, error description when failed
                  data:
                    type: object
                    properties: {}
                    x-apidog-orders: []
                    x-apidog-ignore-properties: []
                x-apidog-orders:
                  - code
                  - msg
                  - data
                required:
                  - code
                  - msg
                  - data
                x-apidog-ignore-properties: []
              example:
                code: 500
                msg: >-
                  Server Error - An unexpected error occurred while processing
                  the request
                data: null
          headers: {}
          x-apidog-name: 'Error '
      security:
        - BearerAuth: []
          x-apidog:
            schemeGroups:
              - id: kn8M4YUlc5i0A0179ezwx
                schemeIds:
                  - BearerAuth
            required: true
            use:
              id: kn8M4YUlc5i0A0179ezwx
            scopes:
              kn8M4YUlc5i0A0179ezwx:
                BearerAuth: []
      callbacks:
        audioGenerated:
          '{request.body#/callBackUrl}':
            post:
              description: >-
                When vocal generation is completed, the system will call this
                callback to notify the results.


                ### Callback Example

                ```json

                {
                  "code": 200,
                  "msg": "All generated successfully.",
                  "data": {
                    "callbackType": "complete",
                    "task_id": "2fac****9f72",
                    "data": [
                      {
                        "id": "e231****-****-****-****-****8cadc7dc",
                        "audio_url": "https://example.cn/****.mp3",
                        "stream_audio_url": "https://example.cn/****",
                        "image_url": "https://example.cn/****.jpeg",
                        "prompt": "[Verse] Night city lights shining bright",
                        "model_name": "chirp-v4-5",
                        "title": "Iron Man",
                        "tags": "electrifying, rock",
                        "createTime": "2025-01-01 00:00:00",
                        "duration": 198.44
                      }
                    ]
                  }
                }

                ```
              requestBody:
                content:
                  application/json:
                    schema:
                      type: object
                      properties:
                        code:
                          type: integer
                          description: Status code
                          example: 200
                        msg:
                          type: string
                          description: Return message
                          example: All generated successfully
                        data:
                          type: object
                          properties:
                            callbackType:
                              type: string
                              description: >-
                                Callback type: text (text generation completed),
                                first (first track completed), complete (all
                                completed)
                              enum:
                                - text
                                - first
                                - complete
                            task_id:
                              type: string
                              description: Task ID
                            data:
                              type: array
                              items:
                                type: object
                                properties:
                                  id:
                                    type: string
                                    description: Audio unique identifier (audioId)
                                  audio_url:
                                    type: string
                                    description: Audio file URL
                                  stream_audio_url:
                                    type: string
                                    description: Streaming audio URL
                                  image_url:
                                    type: string
                                    description: Cover image URL
                                  prompt:
                                    type: string
                                    description: Generation prompt/lyrics
                                  model_name:
                                    type: string
                                    description: Model name used
                                  title:
                                    type: string
                                    description: Music title
                                  tags:
                                    type: string
                                    description: Music tags
                                  createTime:
                                    type: string
                                    description: Creation time
                                    format: date-time
                                  duration:
                                    type: number
                                    description: Audio duration (seconds)
              responses:
                '200':
                  description: Callback received successfully
                  content:
                    application/json:
                      schema:
                        allOf:
                          - type: object
                            properties:
                              code:
                                type: integer
                                enum:
                                  - 200
                                  - 400
                                  - 408
                                  - 413
                                  - 500
                                  - 501
                                  - 531
                                description: >-
                                  Response status code


                                  - **200**: Success - Request processed
                                  successfully

                                  - **400**: Validation error - Lyrics contain
                                  copyrighted content.

                                  - **408**: Rate limit exceeded - Timeout.

                                  - **413**: Conflict - Uploaded audio matches
                                  existing artwork.

                                  - **500**: Server error - Unexpected error
                                  occurred while processing request

                                  - **501**: Audio generation failed.

                                  - **531**: Server error - Sorry, generation
                                  failed due to issues. Your credits have been
                                  refunded. Please try again.
                              msg:
                                type: string
                                description: Error message when code != 200
                                example: success
                      example:
                        code: 200
                        msg: success
      x-apidog-folder: docs/en/Market/Suno API/Music Generation
      x-apidog-status: released
      x-run-in-apidog: https://app.apidog.com/web/project/1184766/apis/api-28506288-run
components:
  schemas: {}
  securitySchemes:
    BearerAuth:
      type: bearer
      scheme: bearer
      bearerFormat: API Key
      description: |-
        所有 API 均需要通过 Bearer Token 进行身份验证。

        获取 API Key：
        1. 访问 [API Key 管理页面](https://kie.ai/api-key) 获取您的 API Key

        使用方法：
        在请求头中添加：
        Authorization: Bearer YOUR_API_KEY

        注意：
        - 请妥善保管您的 API Key，不要与他人分享
        - 如果您怀疑 API Key 已泄露，请立即在管理页面重置
servers:
  - url: https://api.kie.ai
    description: 正式环境
security:
  - BearerAuth: []
    x-apidog:
      schemeGroups:
        - id: kn8M4YUlc5i0A0179ezwx
          schemeIds:
            - BearerAuth
      required: true
      use:
        id: kn8M4YUlc5i0A0179ezwx
      scopes:
        kn8M4YUlc5i0A0179ezwx:
          BearerAuth: []

```


# ========== get-music-details ==========

# Get Music Task Details

## OpenAPI Specification

```yaml
openapi: 3.0.1
info:
  title: ''
  description: ''
  version: 1.0.0
paths:
  /api/v1/generate/record-info:
    get:
      summary: Get Music Task Details
      deprecated: false
      description: >-
        Retrieve detailed information about a music generation task.


        ### Usage Guide

        - Use this endpoint to check task status and access generation results

        - Task details include status, parameters, and generated tracks

        - Generated tracks can be accessed through the returned URLs


        ### Status Descriptions

        - `PENDING`: Task is waiting to be processed

        - `TEXT_SUCCESS`: Lyrics/text generation completed successfully

        - `FIRST_SUCCESS`: First track generation completed

        - `SUCCESS`: All tracks generated successfully

        - `CREATE_TASK_FAILED`: Failed to create task

        - `GENERATE_AUDIO_FAILED`: Failed to generate audio

        - `CALLBACK_EXCEPTION`: Error during callback process

        - `SENSITIVE_WORD_ERROR`: Content filtered due to sensitive words


        ### Developer Notes

        - For instrumental tracks (`instrumental=true`), no lyrics data will be
        included

        - Maximum query rate: 3 requests per second per task

        - Response includes direct URLs to audio files, images, and streaming
        endpoints
      operationId: get-music-details
      tags:
        - docs/en/Market/Suno API/Music Generation
      parameters:
        - name: taskId
          in: query
          description: >-
            Unique identifier of the music generation task to retrieve. This can
            be either a taskId from a "Generate Music" task or an "Extend Music"
            task.
          required: true
          example: 5c79****be8e
          schema:
            type: string
      responses:
        '200':
          description: Request successful
          content:
            application/json:
              schema:
                allOf:
                  - type: object
                    properties:
                      code:
                        type: integer
                        enum:
                          - 200
                          - 401
                          - 404
                          - 422
                          - 451
                          - 455
                          - 500
                        description: >-
                          Response status code


                          - **200**: Success - Request has been processed
                          successfully

                          - **401**: Unauthorized - Authentication credentials
                          are missing or invalid

                          - **404**: Not Found - The requested resource or
                          endpoint does not exist

                          - **422**: Validation Error - The request parameters
                          failed validation checks

                          - **451**: Unauthorized - Failed to fetch the image.
                          Kindly verify any access limits set by you or your
                          service provider.

                          - **455**: Service Unavailable - System is currently
                          undergoing maintenance

                          - **500**: Server Error - An unexpected error occurred
                          while processing the request
                      msg:
                        type: string
                        description: Error message when code != 200
                        examples:
                          - success
                    x-apidog-orders:
                      - code
                      - msg
                    x-apidog-ignore-properties: []
                  - type: object
                    properties:
                      data:
                        type: object
                        properties:
                          taskId:
                            type: string
                            description: Task ID
                          parentMusicId:
                            type: string
                            description: Parent music ID (only valid when extending music)
                          param:
                            type: string
                            description: Parameter information for task generation
                          response:
                            type: object
                            properties:
                              taskId:
                                type: string
                                description: Task ID
                              sunoData:
                                type: array
                                items:
                                  type: object
                                  properties:
                                    id:
                                      type: string
                                      description: Audio unique identifier (audioId)
                                    audioUrl:
                                      type: string
                                      description: Audio file URL
                                    streamAudioUrl:
                                      type: string
                                      description: Streaming audio URL
                                    imageUrl:
                                      type: string
                                      description: Cover image URL
                                    prompt:
                                      type: string
                                      description: Generation prompt/lyrics
                                    modelName:
                                      type: string
                                      description: Model name used
                                    title:
                                      type: string
                                      description: Music title
                                    tags:
                                      type: string
                                      description: Music tags
                                    createTime:
                                      type: string
                                      description: Creation time
                                      format: date-time
                                    duration:
                                      type: number
                                      description: Audio duration (seconds)
                                  x-apidog-orders:
                                    - id
                                    - audioUrl
                                    - streamAudioUrl
                                    - imageUrl
                                    - prompt
                                    - modelName
                                    - title
                                    - tags
                                    - createTime
                                    - duration
                                  x-apidog-ignore-properties: []
                            x-apidog-orders:
                              - taskId
                              - sunoData
                            x-apidog-ignore-properties: []
                          status:
                            type: string
                            description: Task status
                            enum:
                              - PENDING
                              - TEXT_SUCCESS
                              - FIRST_SUCCESS
                              - SUCCESS
                              - CREATE_TASK_FAILED
                              - GENERATE_AUDIO_FAILED
                              - CALLBACK_EXCEPTION
                              - SENSITIVE_WORD_ERROR
                          type:
                            type: string
                            enum:
                              - chirp-v3-5
                              - chirp-v4
                            description: Task type
                          operationType:
                            type: string
                            enum:
                              - generate
                              - extend
                              - upload_cover
                              - upload_extend
                            description: >-
                              Operation Type


                              - `generate`: Generate Music - Create new music
                              works using AI model

                              - `extend`: Extend Music - Extend or modify
                              existing music works

                              - `upload_cover`: Upload And Cover Audio - Create
                              new music works based on uploaded audio files

                              - `upload_extend`: Upload And Extend Audio -
                              Extend or modify music works based on uploaded
                              audio files
                          errorCode:
                            type: integer
                            format: int32
                            description: >-
                              Error code


                              - **400**: Validation Error - Lyrics contained
                              copyrighted material.

                              - **408**: Rate Limited - Timeout.

                              - **413**: Conflict - Uploaded audio matches
                              existing work of art.
                            enum:
                              - 400
                              - 408
                              - 413
                          errorMessage:
                            type: string
                            description: Error message
                            examples:
                              - ''
                        x-apidog-orders:
                          - taskId
                          - parentMusicId
                          - param
                          - response
                          - status
                          - type
                          - operationType
                          - errorCode
                          - errorMessage
                        x-apidog-ignore-properties: []
                    x-apidog-orders:
                      - data
                    x-apidog-ignore-properties: []
              example:
                code: 200
                msg: success
                data:
                  taskId: 5c79****be8e
                  parentMusicId: ''
                  param: >-
                    {"prompt":"A calm piano
                    track","style":"Classical","title":"Peaceful
                    Piano","customMode":true,"instrumental":true,"model":"V3_5"}
                  response:
                    taskId: 5c79****be8e
                    sunoData:
                      - id: e231****-****-****-****-****8cadc7dc
                        audioUrl: https://example.cn/****.mp3
                        streamAudioUrl: https://example.cn/****
                        imageUrl: https://example.cn/****.jpeg
                        prompt: '[Verse] 夜晚城市 灯火辉煌'
                        modelName: chirp-v3-5
                        title: 钢铁侠
                        tags: electrifying, rock
                        createTime: '2025-01-01 00:00:00'
                        duration: 198.44
                  status: SUCCESS
                  type: GENERATE
                  errorCode: null
                  errorMessage: null
          headers: {}
          x-apidog-name: ''
        '500':
          description: request failed
          content:
            application/json:
              schema:
                type: object
                properties:
                  code:
                    type: integer
                    description: >-
                      Response status code


                      - **200**: Success - Request has been processed
                      successfully

                      - **401**: Unauthorized - Authentication credentials are
                      missing or invalid

                      - **402**: Insufficient Credits - Account does not have
                      enough credits to perform the operation

                      - **404**: Not Found - The requested resource or endpoint
                      does not exist

                      - **422**: Validation Error - The request parameters
                      failed validation checks

                      - **429**: Rate Limited - Request limit has been exceeded
                      for this resource

                      - **455**: Service Unavailable - System is currently
                      undergoing maintenance

                      - **500**: Server Error - An unexpected error occurred
                      while processing the request

                      - **501**: Generation Failed - Content generation task
                      failed

                      - **505**: Feature Disabled - The requested feature is
                      currently disabled
                  msg:
                    type: string
                    description: Response message, error description when failed
                  data:
                    type: object
                    properties: {}
                    x-apidog-orders: []
                    x-apidog-ignore-properties: []
                x-apidog-orders:
                  - code
                  - msg
                  - data
                required:
                  - code
                  - msg
                  - data
                x-apidog-ignore-properties: []
              example:
                code: 500
                msg: >-
                  Server Error - An unexpected error occurred while processing
                  the request
                data: null
          headers: {}
          x-apidog-name: 'Error '
      security:
        - BearerAuth: []
          x-apidog:
            schemeGroups:
              - id: kn8M4YUlc5i0A0179ezwx
                schemeIds:
                  - BearerAuth
            required: true
            use:
              id: kn8M4YUlc5i0A0179ezwx
            scopes:
              kn8M4YUlc5i0A0179ezwx:
                BearerAuth: []
      x-apidog-folder: docs/en/Market/Suno API/Music Generation
      x-apidog-status: released
      x-run-in-apidog: https://app.apidog.com/web/project/1184766/apis/api-28506289-run
components:
  schemas: {}
  securitySchemes:
    BearerAuth:
      type: bearer
      scheme: bearer
      bearerFormat: API Key
      description: |-
        所有 API 均需要通过 Bearer Token 进行身份验证。

        获取 API Key：
        1. 访问 [API Key 管理页面](https://kie.ai/api-key) 获取您的 API Key

        使用方法：
        在请求头中添加：
        Authorization: Bearer YOUR_API_KEY

        注意：
        - 请妥善保管您的 API Key，不要与他人分享
        - 如果您怀疑 API Key 已泄露，请立即在管理页面重置
servers:
  - url: https://api.kie.ai
    description: 正式环境
security:
  - BearerAuth: []
    x-apidog:
      schemeGroups:
        - id: kn8M4YUlc5i0A0179ezwx
          schemeIds:
            - BearerAuth
      required: true
      use:
        id: kn8M4YUlc5i0A0179ezwx
      scopes:
        kn8M4YUlc5i0A0179ezwx:
          BearerAuth: []

```


# ========== get-timestamped-lyrics ==========

# Get Timestamped Lyrics

## OpenAPI Specification

```yaml
openapi: 3.0.1
info:
  title: ''
  description: ''
  version: 1.0.0
paths:
  /api/v1/generate/get-timestamped-lyrics:
    post:
      summary: Get Timestamped Lyrics
      deprecated: false
      description: >-
        Retrieve synchronized lyrics with precise timestamps for music tracks.


        ### Usage Guide

        - Use this endpoint to get lyrics that synchronize with audio playback

        - Implement karaoke-style lyric displays in your music players

        - Create visualizations that match audio timing


        ### Parameter Details

        - Both `taskId` and `audioId` are required to identify the specific
        track

        - The `taskId` comes from either "Generate Music" or "Extend Music"
        endpoints

        - The `audioId` identifies the specific track version when multiple were
        generated


        ### Developer Notes

        - Timestamps are provided in seconds for precise synchronization

        - Waveform data is included for audio visualization implementations

        - For instrumental tracks (created with `instrumental=true`), no lyrics
        data will be returned
      operationId: get-timestamped-lyrics
      tags:
        - docs/en/Market/Suno API/Music Generation
      parameters: []
      requestBody:
        content:
          application/json:
            schema:
              type: object
              required:
                - taskId
                - audioId
              properties:
                taskId:
                  type: string
                  description: >-
                    Unique identifier of the music generation task. This should
                    be a taskId returned from either the "Generate Music" or
                    "Extend Music" endpoints.
                  examples:
                    - 5c79****be8e
                audioId:
                  type: string
                  description: >-
                    Unique identifier of the specific audio track for which to
                    retrieve lyrics. This ID is returned in the callback data
                    after music generation completes.
                  examples:
                    - e231****-****-****-****-****8cadc7dc
              x-apidog-orders:
                - taskId
                - audioId
              x-apidog-ignore-properties: []
            example:
              taskId: 5c79****be8e
              audioId: e231****-****-****-****-****8cadc7dc
      responses:
        '200':
          description: Request successful
          content:
            application/json:
              schema:
                allOf:
                  - type: object
                    properties:
                      code:
                        type: integer
                        enum:
                          - 200
                          - 401
                          - 404
                          - 422
                          - 429
                          - 451
                          - 455
                          - 500
                        description: >-
                          Response status code


                          - **200**: Success - Request has been processed
                          successfully

                          - **401**: Unauthorized - Authentication credentials
                          are missing or invalid

                          - **404**: Not Found - The requested resource or
                          endpoint does not exist

                          - **422**: Validation Error - The request parameters
                          failed validation checks

                          - **429**: Rate Limited - Request limit has been
                          exceeded for this resource

                          - **451**: Unauthorized - Failed to fetch the image.
                          Kindly verify any access limits set by you or your
                          service provider.

                          - **455**: Service Unavailable - System is currently
                          undergoing maintenance

                          - **500**: Server Error - An unexpected error occurred
                          while processing the request
                      msg:
                        type: string
                        description: Error message when code != 200
                        examples:
                          - success
                    x-apidog-orders:
                      - code
                      - msg
                    x-apidog-ignore-properties: []
                  - type: object
                    properties:
                      data:
                        type: object
                        properties:
                          alignedWords:
                            type: array
                            description: List of aligned lyrics words
                            items:
                              type: object
                              properties:
                                word:
                                  type: string
                                  description: Lyrics word
                                  examples:
                                    - |-
                                      [Verse]
                                      Waggin'
                                success:
                                  type: boolean
                                  description: Whether lyrics word is successfully aligned
                                  examples:
                                    - true
                                startS:
                                  type: number
                                  description: Word start time (seconds)
                                  examples:
                                    - 1.36
                                endS:
                                  type: number
                                  description: Word end time (seconds)
                                  examples:
                                    - 1.79
                                palign:
                                  type: integer
                                  description: Alignment parameter
                                  examples:
                                    - 0
                              x-apidog-orders:
                                - word
                                - success
                                - startS
                                - endS
                                - palign
                              x-apidog-ignore-properties: []
                          waveformData:
                            type: array
                            description: Waveform data, used for audio visualization
                            items:
                              type: number
                            examples:
                              - - 0
                                - 1
                                - 0.5
                                - 0.75
                          hootCer:
                            type: number
                            description: Lyrics alignment accuracy score
                            examples:
                              - 0.3803191489361702
                          isStreamed:
                            type: boolean
                            description: Whether it's streaming audio
                            examples:
                              - false
                        x-apidog-orders:
                          - alignedWords
                          - waveformData
                          - hootCer
                          - isStreamed
                        x-apidog-ignore-properties: []
                    x-apidog-orders:
                      - data
                    x-apidog-ignore-properties: []
              example:
                code: 200
                msg: success
                data:
                  alignedWords:
                    - word: |-
                        [Verse]
                        Waggin'
                      success: true
                      startS: 1.36
                      endS: 1.79
                      palign: 0
                  waveformData:
                    - 0
                    - 1
                    - 0.5
                    - 0.75
                  hootCer: 0.3803191489361702
                  isStreamed: false
          headers: {}
          x-apidog-name: ''
        '500':
          description: request failed
          content:
            application/json:
              schema:
                type: object
                properties:
                  code:
                    type: integer
                    description: >-
                      Response status code


                      - **200**: Success - Request has been processed
                      successfully

                      - **401**: Unauthorized - Authentication credentials are
                      missing or invalid

                      - **402**: Insufficient Credits - Account does not have
                      enough credits to perform the operation

                      - **404**: Not Found - The requested resource or endpoint
                      does not exist

                      - **422**: Validation Error - The request parameters
                      failed validation checks

                      - **429**: Rate Limited - Request limit has been exceeded
                      for this resource

                      - **455**: Service Unavailable - System is currently
                      undergoing maintenance

                      - **500**: Server Error - An unexpected error occurred
                      while processing the request

                      - **501**: Generation Failed - Content generation task
                      failed

                      - **505**: Feature Disabled - The requested feature is
                      currently disabled
                  msg:
                    type: string
                    description: Response message, error description when failed
                  data:
                    type: object
                    properties: {}
                    x-apidog-orders: []
                    x-apidog-ignore-properties: []
                x-apidog-orders:
                  - code
                  - msg
                  - data
                required:
                  - code
                  - msg
                  - data
                x-apidog-ignore-properties: []
              example:
                code: 500
                msg: >-
                  Server Error - An unexpected error occurred while processing
                  the request
                data: null
          headers: {}
          x-apidog-name: 'Error '
      security:
        - BearerAuth: []
          x-apidog:
            schemeGroups:
              - id: kn8M4YUlc5i0A0179ezwx
                schemeIds:
                  - BearerAuth
            required: true
            use:
              id: kn8M4YUlc5i0A0179ezwx
            scopes:
              kn8M4YUlc5i0A0179ezwx:
                BearerAuth: []
      x-apidog-folder: docs/en/Market/Suno API/Music Generation
      x-apidog-status: released
      x-run-in-apidog: https://app.apidog.com/web/project/1184766/apis/api-28506290-run
components:
  schemas: {}
  securitySchemes:
    BearerAuth:
      type: bearer
      scheme: bearer
      bearerFormat: API Key
      description: |-
        所有 API 均需要通过 Bearer Token 进行身份验证。

        获取 API Key：
        1. 访问 [API Key 管理页面](https://kie.ai/api-key) 获取您的 API Key

        使用方法：
        在请求头中添加：
        Authorization: Bearer YOUR_API_KEY

        注意：
        - 请妥善保管您的 API Key，不要与他人分享
        - 如果您怀疑 API Key 已泄露，请立即在管理页面重置
servers:
  - url: https://api.kie.ai
    description: 正式环境
security:
  - BearerAuth: []
    x-apidog:
      schemeGroups:
        - id: kn8M4YUlc5i0A0179ezwx
          schemeIds:
            - BearerAuth
      required: true
      use:
        id: kn8M4YUlc5i0A0179ezwx
      scopes:
        kn8M4YUlc5i0A0179ezwx:
          BearerAuth: []

```


# ========== boost-music-style ==========

# Boost Music Style

## OpenAPI Specification

```yaml
openapi: 3.0.1
info:
  title: ''
  description: ''
  version: 1.0.0
paths:
  /api/v1/style/generate:
    post:
      summary: Boost Music Style
      deprecated: false
      description: ''
      operationId: boost-music-style
      tags:
        - docs/en/Market/Suno API/Music Generation
      parameters: []
      requestBody:
        content:
          application/json:
            schema:
              type: object
              required:
                - content
              properties:
                content:
                  type: string
                  description: >-
                    Style description. Please describe in concise and clear
                    language the music style you expect to generate. Example:
                    'Pop, Mysterious'
                  examples:
                    - Pop, Mysterious
              x-apidog-orders:
                - content
              x-apidog-ignore-properties: []
            example:
              content: Pop, Mysterious
      responses:
        '200':
          description: Request successful
          content:
            application/json:
              schema:
                allOf:
                  - type: object
                    properties:
                      code:
                        type: integer
                        enum:
                          - 200
                          - 401
                          - 402
                          - 404
                          - 409
                          - 422
                          - 429
                          - 451
                          - 455
                          - 500
                        description: >-
                          Response status code


                          - **200**: Success - Request has been processed
                          successfully

                          - **401**: Unauthorized - Authentication credentials
                          are missing or invalid

                          - **402**: Insufficient Credits - Account does not
                          have enough credits to perform the operation

                          - **404**: Not Found - The requested resource or
                          endpoint does not exist

                          - **409**: Conflict - WAV record already exists

                          - **422**: Validation Error - The request parameters
                          failed validation checks

                          - **429**: Rate Limited - Request limit has been
                          exceeded for this resource

                          - **451**: Unauthorized - Failed to fetch the image.
                          Kindly verify any access limits set by you or your
                          service provider.

                          - **455**: Service Unavailable - System is currently
                          undergoing maintenance

                          - **500**: Server Error - An unexpected error occurred
                          while processing the request
                      msg:
                        type: string
                        description: Error message when code != 200
                        examples:
                          - success
                    x-apidog-orders:
                      - code
                      - msg
                    x-apidog-ignore-properties: []
                  - type: object
                    properties:
                      data:
                        type: object
                        properties:
                          taskId:
                            type: string
                            description: Task ID
                          param:
                            type: string
                            description: Request parameters
                          result:
                            type: string
                            description: The final generated music style text result.
                          creditsConsumed:
                            type: number
                            description: >-
                              Credits consumed, up to 5 digits, up to 2 decimal
                              places
                          creditsRemaining:
                            type: number
                            description: Credits remaining after this task
                          successFlag:
                            type: string
                            description: 'Execution result: 0-pending, 1-success, 2-failed'
                          errorCode:
                            type: integer
                            format: int32
                            description: >-
                              Error code


                              - **400**: Validation Error - Failed, The request
                              parameters failed validation checks.
                            enum:
                              - 400
                          errorMessage:
                            type: string
                            description: Error message
                            examples:
                              - ''
                          createTime:
                            type: string
                            description: Creation time
                        x-apidog-orders:
                          - taskId
                          - param
                          - result
                          - creditsConsumed
                          - creditsRemaining
                          - successFlag
                          - errorCode
                          - errorMessage
                          - createTime
                        x-apidog-ignore-properties: []
                    x-apidog-orders:
                      - data
                    x-apidog-ignore-properties: []
          headers: {}
          x-apidog-name: ''
        '500':
          description: request failed
          content:
            application/json:
              schema:
                type: object
                properties:
                  code:
                    type: integer
                    description: >-
                      Response status code


                      - **200**: Success - Request has been processed
                      successfully

                      - **401**: Unauthorized - Authentication credentials are
                      missing or invalid

                      - **402**: Insufficient Credits - Account does not have
                      enough credits to perform the operation

                      - **404**: Not Found - The requested resource or endpoint
                      does not exist

                      - **422**: Validation Error - The request parameters
                      failed validation checks

                      - **429**: Rate Limited - Request limit has been exceeded
                      for this resource

                      - **455**: Service Unavailable - System is currently
                      undergoing maintenance

                      - **500**: Server Error - An unexpected error occurred
                      while processing the request

                      - **501**: Generation Failed - Content generation task
                      failed

                      - **505**: Feature Disabled - The requested feature is
                      currently disabled
                  msg:
                    type: string
                    description: Response message, error description when failed
                  data:
                    type: object
                    properties: {}
                    x-apidog-orders: []
                    x-apidog-ignore-properties: []
                x-apidog-orders:
                  - code
                  - msg
                  - data
                required:
                  - code
                  - msg
                  - data
                x-apidog-ignore-properties: []
              example:
                code: 500
                msg: >-
                  Server Error - An unexpected error occurred while processing
                  the request
                data: null
          headers: {}
          x-apidog-name: 'Error '
      security:
        - BearerAuth: []
          x-apidog:
            schemeGroups:
              - id: kn8M4YUlc5i0A0179ezwx
                schemeIds:
                  - BearerAuth
            required: true
            use:
              id: kn8M4YUlc5i0A0179ezwx
            scopes:
              kn8M4YUlc5i0A0179ezwx:
                BearerAuth: []
      x-apidog-folder: docs/en/Market/Suno API/Music Generation
      x-apidog-status: released
      x-run-in-apidog: https://app.apidog.com/web/project/1184766/apis/api-28506291-run
components:
  schemas: {}
  securitySchemes:
    BearerAuth:
      type: bearer
      scheme: bearer
      bearerFormat: API Key
      description: |-
        所有 API 均需要通过 Bearer Token 进行身份验证。

        获取 API Key：
        1. 访问 [API Key 管理页面](https://kie.ai/api-key) 获取您的 API Key

        使用方法：
        在请求头中添加：
        Authorization: Bearer YOUR_API_KEY

        注意：
        - 请妥善保管您的 API Key，不要与他人分享
        - 如果您怀疑 API Key 已泄露，请立即在管理页面重置
servers:
  - url: https://api.kie.ai
    description: 正式环境
security:
  - BearerAuth: []
    x-apidog:
      schemeGroups:
        - id: kn8M4YUlc5i0A0179ezwx
          schemeIds:
            - BearerAuth
      required: true
      use:
        id: kn8M4YUlc5i0A0179ezwx
      scopes:
        kn8M4YUlc5i0A0179ezwx:
          BearerAuth: []

```


# ========== cover-suno ==========

# Generate Music Cover

## OpenAPI Specification

```yaml
openapi: 3.0.1
info:
  title: ''
  description: ''
  version: 1.0.0
paths:
  /api/v1/suno/cover/generate:
    post:
      summary: Generate Music Cover
      deprecated: false
      description: >-
        Generate personalized cover images based on original music tasks.


        ### Usage Guide

        - Use this interface to create personalized cover images for generated
        music

        - Requires the taskId of the original music task

        - Each music task can only generate a Cover once; duplicate requests
        will return the existing taskId

        - Results will be notified through the callback URL upon completion


        ### Parameter Details

        - `taskId` identifies the unique identifier of the original music
        generation task

        - `callBackUrl` receives callback address for completion notifications


        ### Developer Notes

        - Cover image file URLs will be retained for 14 days

        - If a Cover has already been generated for this music task, a 400
        status code and existing taskId will be returned

        - It's recommended to call this interface after music generation is
        complete

        - Usually generates 2 different style images for selection
      operationId: generate-cover
      tags:
        - docs/en/Market/Suno API/Music Generation
      parameters: []
      requestBody:
        content:
          application/json:
            schema:
              type: object
              required:
                - taskId
                - callBackUrl
              properties:
                taskId:
                  type: string
                  description: >-
                    Original music task ID, should be the taskId returned by the
                    music generation interface.
                  examples:
                    - 73d6128b3523a0079df10da9471017c8
                callBackUrl:
                  type: string
                  format: uri
                  description: >-
                    URL address for receiving Cover generation task completion
                    updates. This parameter is required for all Cover generation
                    requests.


                    - The system will send POST requests to this URL when Cover
                    generation is complete, including task status and results

                    - Your callback endpoint should be able to accept JSON
                    payloads containing cover image URLs

                    - For detailed callback format and implementation guide, see
                    [Cover Generation
                    Callbacks](https://docs.kie.ai/suno-api/cover-suno-callbacks)

                    - Alternatively, you can use the Get Cover Details interface
                    to poll task status

                    - To ensure callback security, see [Webhook Verification
                    Guide](/common-api/webhook-verification) for signature
                    verification implementation
                  examples:
                    - https://api.example.com/callback
              x-apidog-orders:
                - taskId
                - callBackUrl
              x-apidog-ignore-properties: []
            example:
              taskId: 73d6128b3523a0079df10da9471017c8
              callBackUrl: https://api.example.com/callback
      responses:
        '200':
          description: Success
          content:
            application/json:
              schema:
                allOf:
                  - type: object
                    properties:
                      code:
                        type: integer
                        enum:
                          - 200
                          - 400
                          - 401
                          - 402
                          - 404
                          - 409
                          - 422
                          - 429
                          - 455
                          - 500
                        description: >-
                          Response status code


                          - **200**: Success - Request processed successfully

                          - **400**: Validation error - Cover already generated
                          for this task

                          - **401**: Unauthorized - Authentication credentials
                          missing or invalid

                          - **402**: Insufficient credits - Account doesn't have
                          enough credits for this operation

                          - **404**: Not found - Requested resource or endpoint
                          doesn't exist

                          - **409**: Conflict - Cover record already exists

                          - **422**: Validation error - Request parameters
                          failed validation checks

                          - **429**: Rate limited - Your call frequency is too
                          high. Please try again later.

                          - **455**: Service unavailable - System currently
                          undergoing maintenance

                          - **500**: Server error - Unexpected error occurred
                          while processing request

                          Build failed - Cover image generation failed
                      msg:
                        type: string
                        description: Error message when code != 200
                        examples:
                          - success
                    x-apidog-orders:
                      - code
                      - msg
                    x-apidog-ignore-properties: []
                type: object
                properties:
                  code:
                    type: integer
                    format: int32
                    description: Status code
                    examples:
                      - 200
                  msg:
                    type: string
                    description: Status message
                    examples:
                      - success
                  data:
                    type: object
                    properties:
                      taskId:
                        type: string
                        description: Task ID
                        examples:
                          - 21aee3c3c2a01fa5e030b3799fa4dd56
                    x-apidog-orders:
                      - taskId
                    x-apidog-ignore-properties: []
                x-apidog-orders:
                  - code
                  - msg
                  - data
                x-apidog-ignore-properties: []
              example:
                code: 200
                msg: success
                data:
                  taskId: 21aee3c3c2a01fa5e030b3799fa4dd56
          headers: {}
          x-apidog-name: ''
        '500':
          description: request failed
          content:
            application/json:
              schema:
                type: object
                properties:
                  code:
                    type: integer
                    description: >-
                      Response status code


                      - **200**: Success - Request has been processed
                      successfully

                      - **401**: Unauthorized - Authentication credentials are
                      missing or invalid

                      - **402**: Insufficient Credits - Account does not have
                      enough credits to perform the operation

                      - **404**: Not Found - The requested resource or endpoint
                      does not exist

                      - **422**: Validation Error - The request parameters
                      failed validation checks

                      - **429**: Rate Limited - Request limit has been exceeded
                      for this resource

                      - **455**: Service Unavailable - System is currently
                      undergoing maintenance

                      - **500**: Server Error - An unexpected error occurred
                      while processing the request

                      - **501**: Generation Failed - Content generation task
                      failed

                      - **505**: Feature Disabled - The requested feature is
                      currently disabled
                  msg:
                    type: string
                    description: Response message, error description when failed
                  data:
                    type: object
                    properties: {}
                    x-apidog-orders: []
                    x-apidog-ignore-properties: []
                x-apidog-orders:
                  - code
                  - msg
                  - data
                required:
                  - code
                  - msg
                  - data
                x-apidog-ignore-properties: []
              example:
                code: 500
                msg: >-
                  Server Error - An unexpected error occurred while processing
                  the request
                data: null
          headers: {}
          x-apidog-name: 'Error '
      security:
        - BearerAuth: []
          x-apidog:
            schemeGroups:
              - id: kn8M4YUlc5i0A0179ezwx
                schemeIds:
                  - BearerAuth
            required: true
            use:
              id: kn8M4YUlc5i0A0179ezwx
            scopes:
              kn8M4YUlc5i0A0179ezwx:
                BearerAuth: []
      callbacks:
        onCoverGenerated:
          '{$request.body#/callBackUrl}':
            post:
              summary: Cover generation completion callback
              description: >-
                When Cover generation is complete, the system will send a POST
                request to the provided callback URL to notify results
              requestBody:
                required: true
                content:
                  application/json:
                    schema:
                      allOf:
                        - type: object
                          properties:
                            code:
                              type: integer
                              enum:
                                - 200
                                - 500
                              description: >-
                                Response status code


                                - **200**: Success - Request processed
                                successfully

                                - **500**: Internal error - Please try again
                                later.
                            msg:
                              type: string
                              description: Error message when code != 200
                              example: success
                      type: object
                      required:
                        - code
                        - msg
                        - data
                      properties:
                        code:
                          type: integer
                          description: Status code, 200 indicates success
                          example: 200
                        msg:
                          type: string
                          description: Status message
                          example: success
                        data:
                          type: object
                          required:
                            - taskId
                            - images
                          properties:
                            taskId:
                              type: string
                              description: Unique identifier of the generation task
                              example: 21aee3c3c2a01fa5e030b3799fa4dd56
                            images:
                              type: array
                              items:
                                type: string
                              description: >-
                                Array of accessible cover image URLs, valid for
                                14 days
                              example:
                                - >-
                                  https://tempfile.aiquickdraw.com/s/1753958521_6c1b3015141849d1a9bf17b738ce9347.png
                                - >-
                                  https://tempfile.aiquickdraw.com/s/1753958524_c153143acc6340908431cf0e90cbce9e.png
              responses:
                '200':
                  description: Callback received successfully
      x-apidog-folder: docs/en/Market/Suno API/Music Generation
      x-apidog-status: released
      x-run-in-apidog: https://app.apidog.com/web/project/1184766/apis/api-28506292-run
components:
  schemas: {}
  securitySchemes:
    BearerAuth:
      type: bearer
      scheme: bearer
      bearerFormat: API Key
      description: |-
        所有 API 均需要通过 Bearer Token 进行身份验证。

        获取 API Key：
        1. 访问 [API Key 管理页面](https://kie.ai/api-key) 获取您的 API Key

        使用方法：
        在请求头中添加：
        Authorization: Bearer YOUR_API_KEY

        注意：
        - 请妥善保管您的 API Key，不要与他人分享
        - 如果您怀疑 API Key 已泄露，请立即在管理页面重置
servers:
  - url: https://api.kie.ai
    description: 正式环境
security:
  - BearerAuth: []
    x-apidog:
      schemeGroups:
        - id: kn8M4YUlc5i0A0179ezwx
          schemeIds:
            - BearerAuth
      required: true
      use:
        id: kn8M4YUlc5i0A0179ezwx
      scopes:
        kn8M4YUlc5i0A0179ezwx:
          BearerAuth: []

```


# ========== get-cover-suno-details ==========

# Get Cover Generation Details

## OpenAPI Specification

```yaml
openapi: 3.0.1
info:
  title: ''
  description: ''
  version: 1.0.0
paths:
  /api/v1/suno/cover/record-info:
    get:
      summary: Get Cover Generation Details
      deprecated: false
      description: >-
        Get detailed information about Cover generation tasks.


        ### Usage Guide

        - Use this interface to check Cover generation task status

        - Access generated cover image URLs upon completion

        - Track processing progress and any errors that may occur


        ### Status Description

        - `PENDING`: Task awaiting processing

        - `SUCCESS`: Cover generation completed successfully

        - `CREATE_TASK_FAILED`: Cover generation task creation failed

        - `GENERATE_COVER_FAILED`: Cover image generation process failed


        ### Developer Notes

        - Cover image URLs are only available when status is `SUCCESS` in the
        response

        - Error codes and messages are provided for failed tasks

        - After successful generation, cover images are retained for 14 days
      operationId: get-cover-details
      tags:
        - docs/en/Market/Suno API/Music Generation
      parameters:
        - name: taskId
          in: query
          description: >-
            Unique identifier of the Cover generation task to retrieve. This is
            the taskId returned when creating the Cover generation task.
          required: true
          example: 21aee3c3c2a01fa5e030b3799fa4dd56
          schema:
            type: string
      responses:
        '200':
          description: Success
          content:
            application/json:
              schema:
                allOf:
                  - type: object
                    properties:
                      code:
                        type: integer
                        enum:
                          - 200
                          - 400
                          - 401
                          - 402
                          - 404
                          - 409
                          - 422
                          - 429
                          - 455
                          - 500
                        description: >-
                          Response status code


                          - **200**: Success - Request processed successfully

                          - **400**: Format error - Parameters are not in valid
                          JSON format

                          - **401**: Unauthorized - Authentication credentials
                          missing or invalid

                          - **402**: Insufficient credits - Account doesn't have
                          enough credits for this operation

                          - **404**: Not found - Requested resource or endpoint
                          doesn't exist

                          - **409**: Conflict - Cover record already exists

                          - **422**: Validation error - Request parameters
                          failed validation checks

                          - **429**: Rate limited - Request rate limit exceeded
                          for this resource

                          - **455**: Service unavailable - System currently
                          undergoing maintenance

                          - **500**: Server error - Unexpected error occurred
                          while processing request
                      msg:
                        type: string
                        description: Error message when code != 200
                        examples:
                          - success
                    x-apidog-orders:
                      - code
                      - msg
                    x-apidog-ignore-properties: []
                type: object
                properties:
                  code:
                    type: integer
                    format: int32
                    description: Status code
                    examples:
                      - 200
                  msg:
                    type: string
                    description: Status message
                    examples:
                      - success
                  data:
                    type: object
                    properties:
                      taskId:
                        type: string
                        description: Task ID
                        examples:
                          - 21aee3c3c2a01fa5e030b3799fa4dd56
                      parentTaskId:
                        type: string
                        description: Original music task ID
                        examples:
                          - 73d6128b3523a0079df10da9471017c8
                      callbackUrl:
                        type: string
                        description: Callback URL
                        examples:
                          - https://api.example.com/callback
                      completeTime:
                        type: string
                        format: date-time
                        description: Completion callback time
                        examples:
                          - '2025-01-15T10:35:27.000Z'
                      response:
                        type: object
                        description: Completion callback result
                        properties:
                          images:
                            type: array
                            items:
                              type: string
                            description: Cover image URL array
                            examples:
                              - - >-
                                  https://tempfile.aiquickdraw.com/s/1753958521_6c1b3015141849d1a9bf17b738ce9347.png
                                - >-
                                  https://tempfile.aiquickdraw.com/s/1753958524_c153143acc6340908431cf0e90cbce9e.png
                        x-apidog-orders:
                          - images
                        x-apidog-ignore-properties: []
                      successFlag:
                        type: integer
                        description: >-
                          Task status flag: 0-Pending, 1-Success, 2-Generating,
                          3-Generation failed
                        enum:
                          - 0
                          - 1
                          - 2
                          - 3
                        examples:
                          - 1
                      createTime:
                        type: string
                        format: date-time
                        description: Creation time
                        examples:
                          - '2025-01-15T10:33:01.000Z'
                      errorCode:
                        type: integer
                        format: int32
                        description: |-
                          Error code

                          - **200**: Success - Request processed successfully
                          - **500**: Internal error - Please try again later.
                        enum:
                          - 200
                          - 500
                        examples:
                          - 200
                      errorMessage:
                        type: string
                        description: Error message
                        examples:
                          - ''
                    x-apidog-orders:
                      - taskId
                      - parentTaskId
                      - callbackUrl
                      - completeTime
                      - response
                      - successFlag
                      - createTime
                      - errorCode
                      - errorMessage
                    x-apidog-ignore-properties: []
                x-apidog-orders:
                  - code
                  - msg
                  - data
                x-apidog-ignore-properties: []
              example:
                code: 200
                msg: success
                data:
                  taskId: 21aee3c3c2a01fa5e030b3799fa4dd56
                  parentTaskId: 73d6128b3523a0079df10da9471017c8
                  callbackUrl: https://api.example.com/callback
                  completeTime: '2025-01-15T10:35:27.000Z'
                  response:
                    images:
                      - >-
                        https://tempfile.aiquickdraw.com/s/1753958521_6c1b3015141849d1a9bf17b738ce9347.png
                      - >-
                        https://tempfile.aiquickdraw.com/s/1753958524_c153143acc6340908431cf0e90cbce9e.png
                  successFlag: 1
                  createTime: '2025-01-15T10:33:01.000Z'
                  errorCode: 200
                  errorMessage: ''
          headers: {}
          x-apidog-name: ''
        '500':
          description: request failed
          content:
            application/json:
              schema:
                type: object
                properties:
                  code:
                    type: integer
                    description: >-
                      Response status code


                      - **200**: Success - Request has been processed
                      successfully

                      - **401**: Unauthorized - Authentication credentials are
                      missing or invalid

                      - **402**: Insufficient Credits - Account does not have
                      enough credits to perform the operation

                      - **404**: Not Found - The requested resource or endpoint
                      does not exist

                      - **422**: Validation Error - The request parameters
                      failed validation checks

                      - **429**: Rate Limited - Request limit has been exceeded
                      for this resource

                      - **455**: Service Unavailable - System is currently
                      undergoing maintenance

                      - **500**: Server Error - An unexpected error occurred
                      while processing the request

                      - **501**: Generation Failed - Content generation task
                      failed

                      - **505**: Feature Disabled - The requested feature is
                      currently disabled
                  msg:
                    type: string
                    description: Response message, error description when failed
                  data:
                    type: object
                    properties: {}
                    x-apidog-orders: []
                    x-apidog-ignore-properties: []
                x-apidog-orders:
                  - code
                  - msg
                  - data
                required:
                  - code
                  - msg
                  - data
                x-apidog-ignore-properties: []
              example:
                code: 500
                msg: >-
                  Server Error - An unexpected error occurred while processing
                  the request
                data: null
          headers: {}
          x-apidog-name: 'Error '
      security:
        - BearerAuth: []
          x-apidog:
            schemeGroups:
              - id: kn8M4YUlc5i0A0179ezwx
                schemeIds:
                  - BearerAuth
            required: true
            use:
              id: kn8M4YUlc5i0A0179ezwx
            scopes:
              kn8M4YUlc5i0A0179ezwx:
                BearerAuth: []
      x-apidog-folder: docs/en/Market/Suno API/Music Generation
      x-apidog-status: released
      x-run-in-apidog: https://app.apidog.com/web/project/1184766/apis/api-28506293-run
components:
  schemas: {}
  securitySchemes:
    BearerAuth:
      type: bearer
      scheme: bearer
      bearerFormat: API Key
      description: |-
        所有 API 均需要通过 Bearer Token 进行身份验证。

        获取 API Key：
        1. 访问 [API Key 管理页面](https://kie.ai/api-key) 获取您的 API Key

        使用方法：
        在请求头中添加：
        Authorization: Bearer YOUR_API_KEY

        注意：
        - 请妥善保管您的 API Key，不要与他人分享
        - 如果您怀疑 API Key 已泄露，请立即在管理页面重置
servers:
  - url: https://api.kie.ai
    description: 正式环境
security:
  - BearerAuth: []
    x-apidog:
      schemeGroups:
        - id: kn8M4YUlc5i0A0179ezwx
          schemeIds:
            - BearerAuth
      required: true
      use:
        id: kn8M4YUlc5i0A0179ezwx
      scopes:
        kn8M4YUlc5i0A0179ezwx:
          BearerAuth: []

```


# ========== replace-section ==========

# Replace Music Section

## OpenAPI Specification

```yaml
openapi: 3.0.1
info:
  title: ''
  description: ''
  version: 1.0.0
paths:
  /api/v1/generate/replace-section:
    post:
      summary: Replace Music Section
      deprecated: false
      description: >-
        > Replace a specific time segment within existing music.


        This interface can replace specific time segments in already generated
        music. It requires providing the original music's task ID and the time
        range to be replaced. The replaced audio will naturally blend with the
        original music.


        ## Parameter Details


        ### Required Parameters


        *   `taskId`: Original music's parent task ID

        *   `audioId`: Audio ID to replace

        *   `prompt`: Prompt describing the replacement segment content

        *   `tags`: Music style tags

        *   `title`: Music title

        *   `infillStartS`: Start time point for replacement (seconds, 2 decimal
        places)

        *   `infillEndS`: End time point for replacement (seconds, 2 decimal
        places)


        ### Optional Parameters


        *   `negativeTags`: Music styles to exclude

        *   `fullLyrics`: Complete lyrics after modification, combining both
        modified and unmodified lyrics

        *   `callBackUrl`: Callback address after task completion


        ## Time Range Instructions


        *   `infillStartS` must be less than `infillEndS`.

        *   Time values are precise to 2 decimal places, e.g., `10.50` seconds.

        *   The replacement time range must be between **6 and 60 seconds**.

        *   Replacement duration should not exceed **50%** of the original
        music's total duration.


        ## Developer Notes


        *   Replacement segments will be regenerated based on the provided
        `prompt` and `tags`.

        *   Generated replacement segments will automatically blend with the
        original music's preceding and following parts.

        *   Generated files will be retained for **14 days**.

        *   Query task status using the same interface as generating music: [Get
        Music Details](/suno-api/get-music-details).
      operationId: replace-section
      tags:
        - docs/en/Market/Suno API/Music Generation
      parameters: []
      requestBody:
        content:
          application/json:
            schema:
              type: object
              required:
                - taskId
                - audioId
                - prompt
                - tags
                - title
                - infillStartS
                - infillEndS
              properties:
                taskId:
                  type: string
                  description: >-
                    Original task ID (parent task), used to identify the source
                    music for section replacement
                  examples:
                    - 2fac****9f72
                audioId:
                  type: string
                  description: >-
                    Unique identifier of the audio track to replace. This ID is
                    returned in the callback data after music generation
                    completes.
                  examples:
                    - e231****-****-****-****-****8cadc7dc
                prompt:
                  type: string
                  description: >-
                    Prompt for generating the replacement segment, typically
                    text describing the audio content
                  examples:
                    - A calm and relaxing piano track.
                tags:
                  type: string
                  description: Music style tags, such as jazz, electronic, etc.
                  examples:
                    - Jazz
                title:
                  type: string
                  description: Music title
                  examples:
                    - Relaxing Piano
                negativeTags:
                  type: string
                  description: >-
                    Excluded music styles, used to avoid specific style elements
                    in the replacement segment
                  examples:
                    - Rock
                infillStartS:
                  type: number
                  description: >-
                    Start time point for replacement (seconds), 2 decimal
                    places. Must be less than infillEndS. The time interval
                    (infillEndS - infillStartS) must be between 6 and 60
                    seconds.
                  minimum: 0
                  examples:
                    - 10.5
                infillEndS:
                  type: number
                  description: >-
                    End time point for replacement (seconds), 2 decimal places.
                    Must be greater than infillStartS. The time interval
                    (infillEndS - infillStartS) must be between 6 and 60
                    seconds.
                  minimum: 0
                  examples:
                    - 20.75
                fullLyrics:
                  type: string
                  description: >-
                    Complete lyrics after modification, combining both modified
                    and unmodified lyrics. This parameter contains the full
                    lyrics text that will be used for the entire song after the
                    section replacement.
                  examples:
                    - |-
                      [Verse 1]
                      Original lyrics here
                      [Chorus]
                      Modified lyrics for this section
                      [Verse 2]
                      More original lyrics
                callBackUrl:
                  type: string
                  format: uri
                  description: >-
                    Callback URL for task completion. The system will send a
                    POST request to this URL when replacement is complete,
                    containing task status and results.


                    - Your callback endpoint should be able to accept POST
                    requests containing JSON payloads with replacement results

                    - For detailed callback format and implementation guide, see
                    [Replace Music Section
                    Callbacks](https://docs.kie.ai/suno-api/replace-section-callbacks)

                    - Alternatively, you can use the get music details interface
                    to poll task status

                    - To ensure callback security, see [Webhook Verification
                    Guide](/common-api/webhook-verification) for signature
                    verification implementation
                  examples:
                    - https://example.com/callback
              x-apidog-orders:
                - taskId
                - audioId
                - prompt
                - tags
                - title
                - negativeTags
                - infillStartS
                - infillEndS
                - fullLyrics
                - callBackUrl
              x-apidog-ignore-properties: []
            example:
              taskId: 2fac****9f72
              audioId: e231****-****-****-****-****8cadc7dc
              prompt: A calm and relaxing piano track.
              tags: Jazz
              title: Relaxing Piano
              negativeTags: Rock
              infillStartS: 10.5
              infillEndS: 20.75
              fullLyrics: |-
                [Verse 1]
                Original lyrics here
                [Chorus]
                Modified lyrics for this section
                [Verse 2]
                More original lyrics
              callBackUrl: https://example.com/callback
      responses:
        '200':
          description: Request successful
          content:
            application/json:
              schema:
                allOf:
                  - type: object
                    properties:
                      code:
                        type: integer
                        enum:
                          - 200
                          - 401
                          - 402
                          - 404
                          - 409
                          - 422
                          - 429
                          - 451
                          - 455
                          - 500
                        description: >-
                          Response status code


                          - **200**: Success - Request processed successfully

                          - **401**: Unauthorized - Authentication credentials
                          missing or invalid

                          - **402**: Insufficient credits - Account does not
                          have enough credits to perform this operation

                          - **404**: Not found - Requested resource or endpoint
                          does not exist

                          - **409**: Conflict - WAV record already exists

                          - **422**: Validation error - Request parameters
                          failed validation checks

                          - **429**: Rate limit exceeded - Exceeded request
                          limit for this resource

                          - **451**: Unauthorized - Failed to retrieve image.
                          Please verify any access restrictions set by you or
                          your service provider.

                          - **455**: Service unavailable - System is currently
                          undergoing maintenance

                          - **500**: Server error - Unexpected error occurred
                          while processing request
                      msg:
                        type: string
                        description: Error message when code != 200
                        examples:
                          - success
                    x-apidog-orders:
                      - code
                      - msg
                    x-apidog-ignore-properties: []
                  - type: object
                    properties:
                      data:
                        type: object
                        properties:
                          taskId:
                            type: string
                            description: >-
                              Task ID for tracking task status. You can use this
                              ID to query task details and results through the
                              "Get Music Details" interface.
                            examples:
                              - 5c79****be8e
                        x-apidog-orders:
                          - taskId
                        x-apidog-ignore-properties: []
                    x-apidog-orders:
                      - data
                    x-apidog-ignore-properties: []
          headers: {}
          x-apidog-name: ''
        '500':
          description: request failed
          content:
            application/json:
              schema:
                type: object
                properties:
                  code:
                    type: integer
                    description: >-
                      Response status code


                      - **200**: Success - Request has been processed
                      successfully

                      - **401**: Unauthorized - Authentication credentials are
                      missing or invalid

                      - **402**: Insufficient Credits - Account does not have
                      enough credits to perform the operation

                      - **404**: Not Found - The requested resource or endpoint
                      does not exist

                      - **422**: Validation Error - The request parameters
                      failed validation checks

                      - **429**: Rate Limited - Request limit has been exceeded
                      for this resource

                      - **455**: Service Unavailable - System is currently
                      undergoing maintenance

                      - **500**: Server Error - An unexpected error occurred
                      while processing the request

                      - **501**: Generation Failed - Content generation task
                      failed

                      - **505**: Feature Disabled - The requested feature is
                      currently disabled
                  msg:
                    type: string
                    description: Response message, error description when failed
                  data:
                    type: object
                    properties: {}
                    x-apidog-orders: []
                    x-apidog-ignore-properties: []
                x-apidog-orders:
                  - code
                  - msg
                  - data
                required:
                  - code
                  - msg
                  - data
                x-apidog-ignore-properties: []
              example:
                code: 500
                msg: >-
                  Server Error - An unexpected error occurred while processing
                  the request
                data: null
          headers: {}
          x-apidog-name: 'Error '
      security:
        - BearerAuth: []
          x-apidog:
            schemeGroups:
              - id: kn8M4YUlc5i0A0179ezwx
                schemeIds:
                  - BearerAuth
            required: true
            use:
              id: kn8M4YUlc5i0A0179ezwx
            scopes:
              kn8M4YUlc5i0A0179ezwx:
                BearerAuth: []
      callbacks:
        audioGenerated:
          '{request.body#/callBackUrl}':
            post:
              description: >-
                When audio generation is complete, the system will call this
                callback to notify the result.


                ### Callback Example

                ```json

                {
                  "code": 200,
                  "msg": "All generated successfully.",
                  "data": {
                    "callbackType": "complete",
                    "task_id": "2fac****9f72",
                    "data": [
                      {
                        "id": "e231****-****-****-****-****8cadc7dc",
                        "audio_url": "https://example.cn/****.mp3",
                        "stream_audio_url": "https://example.cn/****",
                        "image_url": "https://example.cn/****.jpeg",
                        "prompt": "A calm and relaxing piano track.",
                        "model_name": "chirp-v3-5",
                        "title": "Relaxing Piano",
                        "tags": "Jazz",
                        "createTime": "2025-01-01 00:00:00",
                        "duration": 198.44
                      }
                    ]
                  }
                }

                ```
              requestBody:
                content:
                  application/json:
                    schema:
                      type: object
                      properties:
                        code:
                          type: integer
                          description: Status code
                          example: 200
                        msg:
                          type: string
                          description: Return message
                          example: All generated successfully
                        data:
                          type: object
                          properties:
                            callbackType:
                              type: string
                              description: >-
                                Callback type: text (text generation complete),
                                first (first song complete), complete (all
                                complete)
                              enum:
                                - text
                                - first
                                - complete
                            task_id:
                              type: string
                              description: Task ID
                            data:
                              type: array
                              items:
                                type: object
                                properties:
                                  id:
                                    type: string
                                    description: Audio unique identifier (audioId)
                                  audio_url:
                                    type: string
                                    description: Audio file URL
                                  stream_audio_url:
                                    type: string
                                    description: Streaming audio URL
                                  image_url:
                                    type: string
                                    description: Cover image URL
                                  prompt:
                                    type: string
                                    description: Generation prompt/lyrics
                                  model_name:
                                    type: string
                                    description: Model name used
                                  title:
                                    type: string
                                    description: Music title
                                  tags:
                                    type: string
                                    description: Music tags
                                  createTime:
                                    type: string
                                    description: Creation time
                                    format: date-time
                                  duration:
                                    type: number
                                    description: Audio duration (seconds)
              responses:
                '200':
                  description: Callback received successfully
                  content:
                    application/json:
                      schema:
                        allOf:
                          - type: object
                            properties:
                              code:
                                type: integer
                                enum:
                                  - 200
                                  - 400
                                  - 408
                                  - 413
                                  - 500
                                  - 501
                                  - 531
                                description: >-
                                  Response status code


                                  - **200**: Success - Request processed
                                  successfully

                                  - **400**: Validation error - Lyrics contain
                                  copyrighted content.

                                  - **408**: Rate limit exceeded - Timeout.

                                  - **413**: Conflict - Uploaded audio matches
                                  existing artwork.

                                  - **500**: Server error - Unexpected error
                                  occurred while processing request

                                  - **501**: Audio generation failed.

                                  - **531**: Server error - Sorry, generation
                                  failed due to issues. Your credits have been
                                  refunded. Please try again.
                              msg:
                                type: string
                                description: Error message when code != 200
                                example: success
                      example:
                        code: 200
                        msg: success
      x-apidog-folder: docs/en/Market/Suno API/Music Generation
      x-apidog-status: released
      x-run-in-apidog: https://app.apidog.com/web/project/1184766/apis/api-28506294-run
components:
  schemas: {}
  securitySchemes:
    BearerAuth:
      type: bearer
      scheme: bearer
      bearerFormat: API Key
      description: |-
        所有 API 均需要通过 Bearer Token 进行身份验证。

        获取 API Key：
        1. 访问 [API Key 管理页面](https://kie.ai/api-key) 获取您的 API Key

        使用方法：
        在请求头中添加：
        Authorization: Bearer YOUR_API_KEY

        注意：
        - 请妥善保管您的 API Key，不要与他人分享
        - 如果您怀疑 API Key 已泄露，请立即在管理页面重置
servers:
  - url: https://api.kie.ai
    description: 正式环境
security:
  - BearerAuth: []
    x-apidog:
      schemeGroups:
        - id: kn8M4YUlc5i0A0179ezwx
          schemeIds:
            - BearerAuth
      required: true
      use:
        id: kn8M4YUlc5i0A0179ezwx
      scopes:
        kn8M4YUlc5i0A0179ezwx:
          BearerAuth: []

```


# ========== generate-persona ==========

# Generate Persona

## OpenAPI Specification

```yaml
openapi: 3.0.1
info:
  title: ''
  description: ''
  version: 1.0.0
paths:
  /api/v1/generate/generate-persona:
    post:
      summary: Generate Persona
      deprecated: false
      description: >-

        > Create a personalized music Persona based on generated music, giving
        the music a unique identity and characteristics.


        ## Usage Guide


        Use this endpoint to create Personas (music characters) for generated
        music:

        * Requires the `taskId` from music generation related endpoints
        (generate, extend, cover, upload-extend) and audio ID

        * Customize the Persona name and description to give music unique
        personality

        * Generated Personas can be used for subsequent music creation and style
        transfer


        ## Parameter Details


        *   **`taskId`** (Required): Can be obtained from the following
        endpoints:
            *   [Generate Music](/suno-api/generate-music) (`/api/v1/generate`)
            *   [Extend Music](/suno-api/extend-music) (`/api/v1/generate/extend`)
            *   [Upload And Cover Audio](/suno-api/upload-and-cover-audio) (`/api/v1/generate/upload-cover`)
            *   [Upload And Extend Audio](/suno-api/upload-and-extend-audio) (`/api/v1/generate/upload-extend`)
        *   **`audioId`** (Required): Specifies the audio ID to create Persona
        for

        *   **`name`** (Required): Assigns an easily recognizable name to the
        Persona

        *   **`description`** (Required): Describes the Persona's musical
        characteristics, style, and personality


        ## Developer Notes


        :::caution Important Requirements

        *   **Ensure the music generation task is fully completed** before
        calling this endpoint. If the music is still generating, this endpoint
        will return a failure.

        *   **Model Requirement**: Persona generation only supports `taskId`
        from music generated with models above v3.5 (v3.5 itself is **not**
        supported).

        *   Each audio ID can only generate a Persona **once**.

        :::


        *   It is recommended to provide detailed descriptions for Personas to
        better capture musical characteristics.

        *   The returned `personaId` can be used in subsequent music generation
        requests to create music with similar style characteristics.

        *   You can apply the `personaId` to the following endpoints:
            *   [Generate Music](/suno-api/generate-music)
            *   [Extend Music](/suno-api/extend-music)
            *   [Upload And Cover Audio](/suno-api/upload-and-cover-audio)
            *   [Upload And Extend Audio](/suno-api/upload-and-extend-audio)

        ## Parameter Example


        ```json

        {
          "taskId": "5c79****be8e",
          "audioId": "e231****-****-****-****-****8cadc7dc",
          "name": "Electronic Pop Singer",
          "description": "A modern electronic music style pop singer, skilled in dynamic rhythms and synthesizer tones"
        }

        ```


        :::note

        Ensure that the music generation task corresponding to the `taskId` is
        complete and the `audioId` is within the valid range.

        :::


        :::tip

        Providing detailed and specific descriptions for Personas helps the
        system more accurately capture musical style characteristics.

        :::
      operationId: generate-persona
      tags:
        - docs/en/Market/Suno API/Music Generation
      parameters: []
      requestBody:
        content:
          application/json:
            schema:
              type: object
              required:
                - taskId
                - audioId
                - name
                - description
              properties:
                taskId:
                  type: string
                  description: >-
                    Unique identifier of the original music generation task.
                    This can be a taskId returned from any of the following
                    endpoints:

                    - Generate Music (/api/v1/generate)

                    - Extend Music (/api/v1/generate/extend)

                    - Upload And Cover Audio (/api/v1/generate/upload-cover)

                    - Upload And Extend Audio (/api/v1/generate/upload-extend)
                  examples:
                    - 5c79****be8e
                audioId:
                  type: string
                  description: >-
                    Unique identifier of the audio track to create Persona for.
                    This ID is returned in the callback data after music
                    generation completes.
                  examples:
                    - e231****-****-****-****-****8cadc7dc
                name:
                  type: string
                  description: >-
                    Name for the Persona. A descriptive name that captures the
                    essence of the musical style or character.
                  examples:
                    - Electronic Pop Singer
                description:
                  type: string
                  description: >-
                    Detailed description of the Persona's musical
                    characteristics, style, and personality. Be specific about
                    genre, mood, instrumentation, and vocal qualities.
                  examples:
                    - >-
                      A modern electronic music style pop singer, skilled in
                      dynamic rhythms and synthesizer tones
                ' vocalStart':
                  type: number
                  description: >-
                    Start time (in seconds) for Persona analysis segment
                    extraction. Used to specify the time point in the audio from
                    which to extract the segment for Persona analysis. Must be
                    less than vocalEnd, and vocalEnd - vocalStart must be
                    between 10–30 seconds. Defaults to 0.0.
                  default: 0
                  examples:
                    - 12.5
                  minimum: 0
                ' vocalEnd':
                  type: number
                  description: >-
                    End time (in seconds) for Persona analysis segment
                    extraction. Together with vocalStart, used to specify the
                    time range for analysis. vocalEnd - vocalStart must be
                    between 10–30 seconds. Defaults to 30.0.
                  multipleOf: 0.01
                  default: 30
                  examples:
                    - 25.8
                  minimum: 0
                style:
                  type: string
                  description: >-
                    Optional. Used to supplement the description of the music
                    style tag corresponding to the Persona, such as "Electronic
                    Pop", "Jazz Trio", etc.
              x-apidog-orders:
                - taskId
                - audioId
                - name
                - description
                - ' vocalStart'
                - ' vocalEnd'
                - style
              x-apidog-ignore-properties: []
            example:
              taskId: 5c79****be8e
              audioId: e231****-****-****-****-****8cadc7dc
              name: Electronic Pop Singer
              description: >-
                A modern electronic music style pop singer, skilled in dynamic
                rhythms and synthesizer tones
              vocalStart: 0
              vocalEnd: 30
              style: Electronic Pop
      responses:
        '200':
          description: Request successful
          content:
            application/json:
              schema:
                allOf:
                  - type: object
                    properties:
                      code:
                        type: integer
                        enum:
                          - 200
                          - 401
                          - 402
                          - 404
                          - 409
                          - 422
                          - 429
                          - 451
                          - 455
                          - 500
                        description: >-
                          Response Status Codes


                          - **200**: Success - Request has been processed
                          successfully  

                          - **401**: Unauthorized - Authentication credentials
                          are missing or invalid  

                          - **402**: Insufficient Credits - Account does not
                          have enough credits to perform the operation  

                          - **404**: Not Found - The requested resource or
                          endpoint does not exist  

                          - **409**: Conflict - Persona already exists for this
                          music

                          - **422**: Validation Error - The request parameters
                          failed validation checks  

                          - **429**: Rate Limited - Request limit has been
                          exceeded for this resource  

                          - **451**: Unauthorized - Failed to fetch the music
                          data. Kindly verify any access limits set by you or
                          your service provider  

                          - **455**: Service Unavailable - System is currently
                          undergoing maintenance  

                          - **500**: Server Error - An unexpected error occurred
                          while processing the request
                      msg:
                        type: string
                        description: Error message when code != 200
                        examples:
                          - success
                    x-apidog-orders:
                      - code
                      - msg
                    x-apidog-ignore-properties: []
                  - type: object
                    properties:
                      data:
                        type: object
                        properties:
                          personaId:
                            type: string
                            description: >-
                              Unique identifier for the generated Persona. This
                              personaId can be used in subsequent music
                              generation requests (Generate Music, Extend Music,
                              Upload And Cover Audio, Upload And Extend Audio)
                              to create music with similar style
                              characteristics.
                            examples:
                              - a1b2****c3d4
                          name:
                            type: string
                            description: Name of the Persona as provided in the request.
                            examples:
                              - Electronic Pop Singer
                          description:
                            type: string
                            description: >-
                              Description of the Persona's musical
                              characteristics, style, and personality as
                              provided in the request.
                            examples:
                              - >-
                                A modern electronic music style pop singer,
                                skilled in dynamic rhythms and synthesizer tones
                        x-apidog-orders:
                          - personaId
                          - name
                          - description
                        x-apidog-ignore-properties: []
                    x-apidog-orders:
                      - data
                    x-apidog-ignore-properties: []
          headers: {}
          x-apidog-name: ''
        '500':
          description: request failed
          content:
            application/json:
              schema:
                type: object
                properties:
                  code:
                    type: integer
                    description: >-
                      Response status code


                      - **200**: Success - Request has been processed
                      successfully

                      - **401**: Unauthorized - Authentication credentials are
                      missing or invalid

                      - **402**: Insufficient Credits - Account does not have
                      enough credits to perform the operation

                      - **404**: Not Found - The requested resource or endpoint
                      does not exist

                      - **422**: Validation Error - The request parameters
                      failed validation checks

                      - **429**: Rate Limited - Request limit has been exceeded
                      for this resource

                      - **455**: Service Unavailable - System is currently
                      undergoing maintenance

                      - **500**: Server Error - An unexpected error occurred
                      while processing the request

                      - **501**: Generation Failed - Content generation task
                      failed

                      - **505**: Feature Disabled - The requested feature is
                      currently disabled
                  msg:
                    type: string
                    description: Response message, error description when failed
                  data:
                    type: object
                    properties: {}
                    x-apidog-orders: []
                    x-apidog-ignore-properties: []
                x-apidog-orders:
                  - code
                  - msg
                  - data
                required:
                  - code
                  - msg
                  - data
                x-apidog-ignore-properties: []
              example:
                code: 500
                msg: >-
                  Server Error - An unexpected error occurred while processing
                  the request
                data: null
          headers: {}
          x-apidog-name: 'Error '
      security:
        - BearerAuth: []
          x-apidog:
            schemeGroups:
              - id: kn8M4YUlc5i0A0179ezwx
                schemeIds:
                  - BearerAuth
            required: true
            use:
              id: kn8M4YUlc5i0A0179ezwx
            scopes:
              kn8M4YUlc5i0A0179ezwx:
                BearerAuth: []
      x-apidog-folder: docs/en/Market/Suno API/Music Generation
      x-apidog-status: released
      x-run-in-apidog: https://app.apidog.com/web/project/1184766/apis/api-28506295-run
components:
  schemas: {}
  securitySchemes:
    BearerAuth:
      type: bearer
      scheme: bearer
      bearerFormat: API Key
      description: |-
        所有 API 均需要通过 Bearer Token 进行身份验证。

        获取 API Key：
        1. 访问 [API Key 管理页面](https://kie.ai/api-key) 获取您的 API Key

        使用方法：
        在请求头中添加：
        Authorization: Bearer YOUR_API_KEY

        注意：
        - 请妥善保管您的 API Key，不要与他人分享
        - 如果您怀疑 API Key 已泄露，请立即在管理页面重置
servers:
  - url: https://api.kie.ai
    description: 正式环境
security:
  - BearerAuth: []
    x-apidog:
      schemeGroups:
        - id: kn8M4YUlc5i0A0179ezwx
          schemeIds:
            - BearerAuth
      required: true
      use:
        id: kn8M4YUlc5i0A0179ezwx
      scopes:
        kn8M4YUlc5i0A0179ezwx:
          BearerAuth: []

```


# ========== generate-mashup ==========

# Generate Mashup Music

## OpenAPI Specification

```yaml
openapi: 3.0.1
info:
  title: ''
  description: ''
  version: 1.0.0
paths:
  /api/v1/generate/mashup:
    post:
      summary: Generate Mashup Music
      deprecated: false
      description: >-
        > Create remix music using AI models by combining multiple audio tracks.


        ## Usage Guide


        - This interface creates remix music from up to 2 uploaded audio files.

        - It combines elements from multiple tracks into a coherent new piece.

        - You can control the level of detail using custom mode and instrumental
        settings.


        ## Parameter Details


        - `uploadUrlList` is required and must contain exactly 2 audio file
        URLs.


        ### In Custom Mode (`customMode: true`)


        Character limits for `prompt` across different models:


        | Model | `prompt` Limit | `style` Limit |

        |:---|:---|:---|

        | **V4** | 3000 characters | 200 characters |

        | **V4_5** and **V4_5PLUS** | 5000 characters | 1000 characters |

        | **V4_5ALL** | 5000 characters | 1000 characters |

        | **V5** | 5000 characters | 1000 characters |


        - `title` length limit: 80 characters (all models).


        ### In Non-Custom Mode (`customMode: false`)


        - `prompt` length limit: 500 characters.

        - `instrumental`: Whether to generate instrumental music.

        - Other parameters should be left empty.


        ## Developer Notes


        :::tip


        New users are advised to start with `customMode: false`, which is
        simpler.


        :::


        - Generated files will be retained for 14 days.

        - The callback process has three stages: `text` (text generation),
        `first` (first track complete), `complete` (all complete).

        - Uploaded audio files must have publicly accessible URLs.

        - `uploadUrlList` must contain exactly 2 audio file URLs to initiate
        remix generation.


        ## Optional Parameters


        | Parameter | Type | Description |

        |:---|:---|:---|

        | `vocalGender` | string | Vocal gender preference. `m` for male, `f`
        for female. **Note**: This parameter only takes effect when `customMode`
        is `true`. In practice, this parameter only increases the probability
        but does not guarantee adherence to the specified vocal gender. |

        | `styleWeight` | number | Strength of adherence to style. **Note**:
        This parameter only takes effect when `customMode` is `true`. Range is
        0–1, with two decimal places. Example: `0.61`. |

        | `weirdnessConstraint` | number | Creativity/discreteness level.
        **Note**: This parameter only takes effect when `customMode` is `true`.
        Range is 0–1, with two decimal places. Example: `0.72`. |

        | `audioWeight` | number | Weight of audio elements. **Note**: This
        parameter only takes effect when `customMode` is `true`. Range is 0–1,
        with two decimal places. Example: `0.65`. |
      operationId: generate-mashup
      tags:
        - docs/en/Market/Suno API/Music Generation
      parameters: []
      requestBody:
        content:
          application/json:
            schema:
              type: object
              required:
                - uploadUrlList
                - customMode
                - model
                - callBackUrl
              properties:
                uploadUrlList:
                  type: array
                  description: >-
                    Array of audio file URLs to mashup. Must contain exactly 2
                    URLs. Each URL must be publicly accessible.
                  items:
                    type: string
                    format: uri
                  minItems: 2
                  maxItems: 2
                  examples:
                    - - https://example.com/audio1.mp3
                      - https://example.com/audio2.mp3
                prompt:
                  type: string
                  description: >-
                    A description of the desired audio content.  

                    - In Custom Mode (`customMode: true`): Required if
                    `instrumental` is `false`. The prompt will be strictly used
                    as the lyrics and sung in the generated track. Character
                    limits by model:  
                      - **V4**: Maximum 3000 characters  
                      - **V4_5 & V4_5PLUS**: Maximum 5000 characters  
                      - **V4_5ALL**: Maximum 5000 characters  
                      - **V5**: Maximum 5000 characters  
                      Example: "A calm and relaxing piano track with soft melodies"  
                    - In Non-custom Mode (`customMode: false`): Always required.
                    The prompt serves as the core idea, and lyrics will be
                    automatically generated based on it (not strictly matching
                    the input). Maximum 500 characters.  
                      Example: "A short relaxing piano tune"
                  examples:
                    - A calm and relaxing piano track with soft melodies
                style:
                  type: string
                  description: >-
                    Music style specification for the generated audio.  

                    - Only available and required in Custom Mode (`customMode:
                    true`). Defines the genre, mood, or artistic direction.  

                    - Character limits by model:  
                      - **V4**: Maximum 200 characters  
                      - **V4_5 & V4_5PLUS**: Maximum 1000 characters  
                      - **V4_5ALL**: Maximum 1000 characters  
                      - **V5**: Maximum 1000 characters  
                    - Common examples: Jazz, Classical, Electronic, Pop, Rock,
                    Hip-hop, etc.
                  examples:
                    - Jazz
                title:
                  type: string
                  description: >-
                    Title for the generated music track.  

                    - Only available and required in Custom Mode (`customMode:
                    true`).  

                    - Max length: 80 characters.  

                    - Will be displayed in player interfaces and filenames.
                  examples:
                    - Relaxing Piano
                customMode:
                  type: boolean
                  description: >-
                    Determines if advanced parameter customization is enabled.  

                    - If `true`: Allows detailed control with specific
                    requirements for `style` and `title` fields.  

                    - If `false`: Simplified mode where only `prompt` is
                    required and other parameters are ignored.
                  examples:
                    - true
                instrumental:
                  type: boolean
                  description: >-
                    Determines if the audio should be instrumental (no
                    lyrics).  

                    - In Custom Mode (`customMode: true`):  
                      - If `true`: Only `style` and `title` are required.  
                      - If `false`: `style`, `title`, and `prompt` are required (with prompt used as the exact lyrics).  
                    - In Non-custom Mode (`customMode: false`): No impact on
                    required fields (prompt only).
                  examples:
                    - true
                model:
                  type: string
                  description: |-
                    The AI model version to use for generation.  
                    - Required for all requests.  
                    - Available options:  
                      - **`V5`**: Superior musical expression, faster generation.  
                      - **`V4_5PLUS`**: V4.5+ delivers richer sound, new ways to create, max 8 min.  
                      - **`V4_5`**: V4.5 enables smarter prompts, faster generations, max 8 min.  
                      - **`V4_5ALL`**: V4.5ALL enables smarter prompts, faster generations, max 8 min.  
                      - **`V4`**: V4 improves vocal quality, max 4 min.
                  enum:
                    - V4
                    - V4_5
                    - V4_5PLUS
                    - V4_5ALL
                    - V5
                  examples:
                    - V4
                callBackUrl:
                  type: string
                  format: uri
                  description: >-
                    The URL to receive music generation task completion updates.
                    Required for all music generation requests.


                    - System will POST task status and results to this URL when
                    generation completes

                    - Callback process has three stages: `text` (text
                    generation), `first` (first track complete), `complete` (all
                    tracks complete)

                    - Note: Some cases may skip `text` and `first` stages and
                    return `complete` directly

                    - Your callback endpoint should accept POST requests with
                    JSON payload containing task results and audio URLs

                    - For detailed callback format and implementation guide, see
                    [Music Generation
                    Callbacks](https://docs.kie.ai/suno-api/generate-music-callbacks)

                    - Alternatively, use the Get Music Details endpoint to poll
                    task status

                    - To ensure callback security, see [Webhook Verification
                    Guide](/common-api/webhook-verification) for signature
                    verification implementation
                  examples:
                    - https://example.com/callback
                vocalGender:
                  type: string
                  description: >-
                    Vocal gender preference for the singing voice.  

                    - Only available in Custom Mode (`customMode: true`).
                    Optional. Use 'm' for male and 'f' for female. Based on
                    practice, this parameter can only increase the probability
                    but cannot guarantee adherence to male/female voice
                    instructions.
                  enum:
                    - m
                    - f
                  examples:
                    - m
                styleWeight:
                  type: number
                  description: >-
                    Strength of adherence to the specified style.  

                    - Only available in Custom Mode (`customMode: true`).
                    Optional. Range 0–1, up to 2 decimal places.
                  minimum: 0
                  maximum: 1
                  multipleOf: 0.01
                  examples:
                    - 0.61
                weirdnessConstraint:
                  type: number
                  description: >-
                    Controls experimental/creative deviation.  

                    - Only available in Custom Mode (`customMode: true`).
                    Optional. Range 0–1, up to 2 decimal places.
                  minimum: 0
                  maximum: 1
                  multipleOf: 0.01
                  examples:
                    - 0.72
                audioWeight:
                  type: number
                  description: >-
                    Balance weight for audio features vs. other factors.  

                    - Only available in Custom Mode (`customMode: true`).
                    Optional. Range 0–1, up to 2 decimal places.
                  minimum: 0
                  maximum: 1
                  multipleOf: 0.01
                  examples:
                    - 0.65
              x-apidog-orders:
                - uploadUrlList
                - prompt
                - style
                - title
                - customMode
                - instrumental
                - model
                - callBackUrl
                - vocalGender
                - styleWeight
                - weirdnessConstraint
                - audioWeight
              x-apidog-ignore-properties: []
            example:
              uploadUrlList:
                - https://example.com/audio1.mp3
                - https://example.com/audio2.mp3
              customMode: true
              model: V4
              callBackUrl: https://example.com/callback
              prompt: A calm and relaxing piano track with soft melodies
              style: Jazz
              title: Relaxing Piano
              instrumental: true
              vocalGender: m
              styleWeight: 0.61
              weirdnessConstraint: 0.72
              audioWeight: 0.65
      responses:
        '200':
          description: Request successful
          content:
            application/json:
              schema:
                allOf:
                  - type: object
                    properties:
                      code:
                        type: integer
                        enum:
                          - 200
                          - 401
                          - 402
                          - 404
                          - 409
                          - 422
                          - 429
                          - 451
                          - 455
                          - 500
                        description: >-
                          Response Status Codes


                          - **200**: Success - Request has been processed
                          successfully  

                          - **401**: Unauthorized - Authentication credentials
                          are missing or invalid  

                          - **402**: Insufficient Credits - Account does not
                          have enough credits to perform the operation  

                          - **404**: Not Found - The requested resource or
                          endpoint does not exist  

                          - **409**: Conflict - WAV record already exists  

                          - **422**: Validation Error - The request parameters
                          failed validation checks  

                          - **429**: Rate Limited - Request limit has been
                          exceeded for this resource  

                          - **451**: Unauthorized - Failed to fetch the image.
                          Kindly verify any access limits set by you or your
                          service provider  

                          - **455**: Service Unavailable - System is currently
                          undergoing maintenance  

                          - **500**: Server Error - An unexpected error occurred
                          while processing the request
                      msg:
                        type: string
                        description: Error message when code != 200
                        examples:
                          - success
                    x-apidog-orders:
                      - code
                      - msg
                    x-apidog-ignore-properties: []
                  - type: object
                    properties:
                      data:
                        type: object
                        properties:
                          taskId:
                            type: string
                            description: >-
                              Task ID for tracking task status. Use this ID with
                              the "Get Music Details" endpoint to query task
                              details and results.
                            examples:
                              - 5c79****be8e
                        x-apidog-orders:
                          - taskId
                        x-apidog-ignore-properties: []
                    x-apidog-orders:
                      - data
                    x-apidog-ignore-properties: []
          headers: {}
          x-apidog-name: ''
        '500':
          description: Server Error
          content:
            application/json:
              schema:
                type: object
                properties: {}
                x-apidog-orders: []
                x-apidog-ignore-properties: []
          headers: {}
          x-apidog-name: Error
      security:
        - BearerAuth: []
          x-apidog:
            schemeGroups:
              - id: kn8M4YUlc5i0A0179ezwx
                schemeIds:
                  - BearerAuth
            required: true
            use:
              id: kn8M4YUlc5i0A0179ezwx
            scopes:
              kn8M4YUlc5i0A0179ezwx:
                BearerAuth: []
      callbacks:
        audioGenerated:
          '{request.body#/callBackUrl}':
            post:
              description: >-
                System will call this callback when audio generation is
                complete.


                ### Callback Example

                ```json

                {
                  "code": 200,
                  "msg": "All generated successfully.",
                  "data": {
                    "callbackType": "complete",
                    "task_id": "2fac****9f72",
                    "data": [
                      {
                        "id": "e231****-****-****-****-****8cadc7dc",
                        "audio_url": "https://example.cn/****.mp3",
                        "stream_audio_url": "https://example.cn/****",
                        "image_url": "https://example.cn/****.jpeg",
                        "prompt": "[Verse] Night city lights shining bright",
                        "model_name": "chirp-v3-5",
                        "title": "Iron Man",
                        "tags": "electrifying, rock",
                        "createTime": "2025-01-01 00:00:00",
                        "duration": 198.44
                      },
                      {
                        "id": "bd15****1873",
                        "audio_url": "https://example.cn/****.mp3",
                        "stream_audio_url": "https://example.cn/****",
                        "image_url": "https://example.cn/****.jpeg",
                        "prompt": "[Verse] Night city lights shining bright",
                        "model_name": "chirp-v3-5",
                        "title": "Iron Man",
                        "tags": "electrifying, rock",
                        "createTime": "2025-01-01 00:00:00",
                        "duration": 228.28
                      }
                    ]
                  }
                }

                ```
              requestBody:
                content:
                  application/json:
                    schema:
                      type: object
                      properties:
                        code:
                          type: integer
                          description: Status code
                          example: 200
                        msg:
                          type: string
                          description: Response message
                          example: All generated successfully
                        data:
                          type: object
                          properties:
                            callbackType:
                              type: string
                              description: >-
                                Callback type: text (text generation complete),
                                first (first track complete), complete (all
                                tracks complete)
                              enum:
                                - text
                                - first
                                - complete
                            task_id:
                              type: string
                              description: Task ID
                            data:
                              type: array
                              items:
                                type: object
                                properties:
                                  id:
                                    type: string
                                    description: Audio unique identifier (audioId)
                                  audio_url:
                                    type: string
                                    description: Audio file URL
                                  stream_audio_url:
                                    type: string
                                    description: Streaming audio URL
                                  image_url:
                                    type: string
                                    description: Cover image URL
                                  prompt:
                                    type: string
                                    description: Generation prompt/lyrics
                                  model_name:
                                    type: string
                                    description: Model name used
                                  title:
                                    type: string
                                    description: Music title
                                  tags:
                                    type: string
                                    description: Music tags
                                  createTime:
                                    type: string
                                    description: Creation time
                                    format: date-time
                                  duration:
                                    type: number
                                    description: Audio duration (seconds)
              responses:
                '200':
                  description: Callback received successfully
                  content:
                    application/json:
                      schema:
                        allOf:
                          - type: object
                            properties:
                              code:
                                type: integer
                                enum:
                                  - 200
                                  - 400
                                  - 408
                                  - 413
                                  - 500
                                  - 501
                                  - 531
                                description: >-
                                  Response status code


                                  - **200**: Success - Request has been
                                  processed successfully

                                  - **400**: Validation Error - Lyrics contained
                                  copyrighted material.

                                  - **408**: Rate Limited - Timeout.

                                  - **413**: Conflict - Uploaded audio matches
                                  existing work of art.

                                  - **500**: Server Error - An unexpected error
                                  occurred while processing the request

                                  - **501**: Audio generation failed.

                                  - **531**: Server Error - Sorry, the
                                  generation failed due to an issue. Your
                                  credits have been refunded. Please try again.
                              msg:
                                type: string
                                description: Error message when code != 200
                                example: success
                      example:
                        code: 200
                        msg: success
      x-apidog-folder: docs/en/Market/Suno API/Music Generation
      x-apidog-status: released
      x-run-in-apidog: https://app.apidog.com/web/project/1184766/apis/api-28506728-run
components:
  schemas: {}
  securitySchemes:
    BearerAuth:
      type: bearer
      scheme: bearer
      bearerFormat: API Key
      description: |-
        所有 API 均需要通过 Bearer Token 进行身份验证。

        获取 API Key：
        1. 访问 [API Key 管理页面](https://kie.ai/api-key) 获取您的 API Key

        使用方法：
        在请求头中添加：
        Authorization: Bearer YOUR_API_KEY

        注意：
        - 请妥善保管您的 API Key，不要与他人分享
        - 如果您怀疑 API Key 已泄露，请立即在管理页面重置
servers:
  - url: https://api.kie.ai
    description: 正式环境
security:
  - BearerAuth: []
    x-apidog:
      schemeGroups:
        - id: kn8M4YUlc5i0A0179ezwx
          schemeIds:
            - BearerAuth
      required: true
      use:
        id: kn8M4YUlc5i0A0179ezwx
      scopes:
        kn8M4YUlc5i0A0179ezwx:
          BearerAuth: []

```


# ========== generate-lyrics ==========

# Generate Lyrics

## OpenAPI Specification

```yaml
openapi: 3.0.1
info:
  title: ''
  description: ''
  version: 1.0.0
paths:
  /api/v1/lyrics:
    post:
      summary: Generate Lyrics
      deprecated: false
      description: >-
        Generate creative lyrics content based on a text prompt.


        ### Usage Guide

        - Use this endpoint to create lyrics for music composition

        - Multiple variations of lyrics will be generated for each request

        - Each generated lyric set includes title and structured verse/chorus
        sections


        ### Parameter Details

        - `prompt` should describe the theme, style, or subject of the desired
        lyrics

        - A detailed prompt yields more targeted and relevant lyrics


        ### Developer Notes

        - Generated lyrics are retained for 14 days

        - Callback occurs once with all generated variations when complete

        - Typically returns 2-3 different lyric variations per request

        - Each lyric set is formatted with standard section markers ([Verse],
        [Chorus], etc.)
      operationId: generate-lyrics
      tags:
        - docs/en/Market/Suno API/Lyrics Generation
      parameters: []
      requestBody:
        content:
          application/json:
            schema:
              type: object
              required:
                - prompt
                - callBackUrl
              properties:
                prompt:
                  type: string
                  description: >-
                    Description of the desired lyrics content. Be specific about
                    theme, mood, style, or story elements you want in the
                    lyrics. More detailed prompts yield better results. The
                    maximum word limit is 200 characters.
                  examples:
                    - >-
                      A nostalgic song about childhood memories and growing up
                      in a small town
                callBackUrl:
                  type: string
                  format: uri
                  description: >-
                    The URL to receive lyrics generation task completion
                    updates. Required for all lyrics generation requests.


                    - System will POST task status and results to this URL when
                    lyrics generation completes

                    - Callback includes all generated lyrics variations with
                    titles and structured content

                    - Your callback endpoint should accept POST requests with
                    JSON payload containing lyrics data

                    - For detailed callback format and implementation guide, see
                    [Lyrics Generation
                    Callbacks](https://docs.kie.ai/suno-api/generate-lyrics-callbacks)

                    - Alternatively, use the Get Lyrics Details endpoint to poll
                    task status

                    - To ensure callback security, see [Webhook Verification
                    Guide](/common-api/webhook-verification) for signature
                    verification implementation
                  examples:
                    - https://api.example.com/callback
              x-apidog-orders:
                - prompt
                - callBackUrl
              x-apidog-ignore-properties: []
            example:
              prompt: >-
                A nostalgic song about childhood memories and growing up in a
                small town
              callBackUrl: https://api.example.com/callback
      responses:
        '200':
          description: Request successful
          content:
            application/json:
              schema:
                allOf:
                  - type: object
                    properties:
                      code:
                        type: integer
                        enum:
                          - 200
                          - 400
                          - 401
                          - 404
                          - 405
                          - 413
                          - 429
                          - 430
                          - 455
                          - 500
                        description: >-
                          Response status code


                          - **200**: Request successful

                          - **400**: Invalid parameters

                          - **401**: Unauthorized access

                          - **404**: Invalid request method or path

                          - **405**: Rate limit exceeded

                          - **413**: Theme or prompt too long

                          - **429**: Insufficient credits

                          - **430**: Your call frequency is too high. Please try
                          again later.

                          - **455**: System maintenance

                          - **500**: Server error
                      msg:
                        type: string
                        description: Error message when code != 200
                        examples:
                          - success
                    x-apidog-orders:
                      - code
                      - msg
                    x-apidog-ignore-properties: []
                  - type: object
                    properties:
                      data:
                        type: object
                        properties:
                          taskId:
                            type: string
                            description: Task ID for tracking task status
                            examples:
                              - 5c79****be8e
                        x-apidog-orders:
                          - taskId
                        x-apidog-ignore-properties: []
                    x-apidog-orders:
                      - data
                    x-apidog-ignore-properties: []
          headers: {}
          x-apidog-name: ''
        '500':
          description: request failed
          content:
            application/json:
              schema:
                type: object
                properties:
                  code:
                    type: integer
                    description: >-
                      Response status code


                      - **200**: Success - Request has been processed
                      successfully

                      - **401**: Unauthorized - Authentication credentials are
                      missing or invalid

                      - **402**: Insufficient Credits - Account does not have
                      enough credits to perform the operation

                      - **404**: Not Found - The requested resource or endpoint
                      does not exist

                      - **422**: Validation Error - The request parameters
                      failed validation checks

                      - **429**: Rate Limited - Request limit has been exceeded
                      for this resource

                      - **455**: Service Unavailable - System is currently
                      undergoing maintenance

                      - **500**: Server Error - An unexpected error occurred
                      while processing the request

                      - **501**: Generation Failed - Content generation task
                      failed

                      - **505**: Feature Disabled - The requested feature is
                      currently disabled
                  msg:
                    type: string
                    description: Response message, error description when failed
                  data:
                    type: object
                    properties: {}
                    x-apidog-orders: []
                    x-apidog-ignore-properties: []
                x-apidog-orders:
                  - code
                  - msg
                  - data
                required:
                  - code
                  - msg
                  - data
                x-apidog-ignore-properties: []
              example:
                code: 500
                msg: >-
                  Server Error - An unexpected error occurred while processing
                  the request
                data: null
          headers: {}
          x-apidog-name: 'Error '
      security:
        - BearerAuth: []
          x-apidog:
            schemeGroups:
              - id: kn8M4YUlc5i0A0179ezwx
                schemeIds:
                  - BearerAuth
            required: true
            use:
              id: kn8M4YUlc5i0A0179ezwx
            scopes:
              kn8M4YUlc5i0A0179ezwx:
                BearerAuth: []
      callbacks:
        audioLyricsGenerated:
          '{$request.body#/callBackUrl}':
            post:
              description: >-
                System will call this callback when lyrics generation is
                complete.


                ### Callback Example

                ```json

                {
                  "code": 200,
                  "data": {
                    "callbackType": "complete",
                    "data": [
                      {
                        "error_message": "",
                        "status": "complete",
                        "text": "[Verse]\n月光洒满了窗台\n星星跳舞不分开\n夜风偷偷织梦来\n心里压抑全抛开\n\n[Verse 2]\n灯火映在你的眼\n像流星划过了天\n世界静止就一瞬间\n追逐未来不管多远\n\n[Chorus]\n星夜梦中找未来\n跳脱平凡别徘徊\n所有的梦都会盛开\n别害怕追去期待\n\n[Verse 3]\n脚步踏着影子走\n黑夜舞曲化解愁\n无声的美比喧嚣\n随心漂流是追求\n\n[Bridge]\n别让时钟锁住天\n别让怀疑把梦编\n逆着风也会更鲜艳\n陪你走过所有难关\n\n[Chorus]\n星夜梦中找未来\n跳脱平凡别徘徊\n所有的梦都会盛开\n别害怕追去期待",
                        "title": "星夜狂想"
                      },
                      {
                        "error_message": "",
                        "status": "complete",
                        "text": "[Verse]\n天边的云跳舞在风里\n追逐梦想越过山和溪\n每一步都写下新的故事\n心中燃烧永不熄的信念\n\n[Verse 2]\n城市的灯照亮午夜的街\n人潮散开我依旧不妥协\n破碎的梦拼凑新的世界\n每一次失败都是一种体验\n\n[Chorus]\n你好你好未来的自己\n你会感激今天的努力\n跌倒再站起笑对这天地\n燃烧吧青春像烈火不息\n\n[Verse 3]\n窗外的雨敲打着玻璃\n像是为我撑起一片绿地\n彷徨的路透过心的指引\n找到方向我无所畏惧\n\n[Bridge]\n耳边风吹散记忆的灰\n让过去成为最美的点缀\n未来的路上脚步更坚定\n看清自己的模样多么耀眼\n\n[Chorus]\n你好你好未来的自己\n你会感激今天的努力\n跌倒再站起笑对这天地\n燃烧吧青春像烈火不息",
                        "title": "你好"
                      }
                    ],
                    "task_id": "3b66882fde0a5d398bd269cab6d9542b"
                  },
                  "msg": "All generated successfully."
                }

                ```
              requestBody:
                content:
                  application/json:
                    schema:
                      allOf:
                        - type: object
                          properties:
                            code:
                              type: integer
                              enum:
                                - 200
                                - 400
                                - 500
                              description: >-
                                Response status code


                                - **200**: Success - Request has been processed
                                successfully

                                - **400**: Please try rephrasing   with more
                                specific details or using a different approach.

                                Song Description contained artist name

                                Song Description flagged for moderation

                                Unable to generate lyrics from song  
                                description

                                - **500**: Internal Error - Please try again
                                later.
                            msg:
                              type: string
                              description: Error message when code != 200
                              example: success
                        - type: object
                          properties:
                            data:
                              type: object
                              properties:
                                taskId:
                                  type: string
                                  description: Task ID for tracking task status
                                  example: 5c79****be8e
                      type: object
                      properties:
                        code:
                          type: integer
                          description: Status code
                          example: 200
                        msg:
                          type: string
                          description: Response message
                          example: All generated successfully
                        data:
                          type: object
                          properties:
                            callbackType:
                              type: string
                              description: Callback type, fixed as complete
                              enum:
                                - complete
                              example: complete
                            task_id:
                              type: string
                              description: Task ID
                            data:
                              type: array
                              description: Generated lyrics list
                              items:
                                type: object
                                properties:
                                  text:
                                    type: string
                                    description: Lyrics content
                                  title:
                                    type: string
                                    description: Lyrics title
                                  status:
                                    type: string
                                    description: Generation status
                                    enum:
                                      - complete
                                      - failed
                                  error_message:
                                    type: string
                                    description: Error message, valid when status is failed
              responses:
                '200':
                  description: Callback received successfully
      x-apidog-folder: docs/en/Market/Suno API/Lyrics Generation
      x-apidog-status: released
      x-run-in-apidog: https://app.apidog.com/web/project/1184766/apis/api-28506296-run
components:
  schemas: {}
  securitySchemes:
    BearerAuth:
      type: bearer
      scheme: bearer
      bearerFormat: API Key
      description: |-
        所有 API 均需要通过 Bearer Token 进行身份验证。

        获取 API Key：
        1. 访问 [API Key 管理页面](https://kie.ai/api-key) 获取您的 API Key

        使用方法：
        在请求头中添加：
        Authorization: Bearer YOUR_API_KEY

        注意：
        - 请妥善保管您的 API Key，不要与他人分享
        - 如果您怀疑 API Key 已泄露，请立即在管理页面重置
servers:
  - url: https://api.kie.ai
    description: 正式环境
security:
  - BearerAuth: []
    x-apidog:
      schemeGroups:
        - id: kn8M4YUlc5i0A0179ezwx
          schemeIds:
            - BearerAuth
      required: true
      use:
        id: kn8M4YUlc5i0A0179ezwx
      scopes:
        kn8M4YUlc5i0A0179ezwx:
          BearerAuth: []

```


# ========== get-lyrics-details ==========

# Get Lyrics Task Details

## OpenAPI Specification

```yaml
openapi: 3.0.1
info:
  title: ''
  description: ''
  version: 1.0.0
paths:
  /api/v1/lyrics/record-info:
    get:
      summary: Get Lyrics Task Details
      deprecated: false
      description: >-
        Retrieve detailed information about a lyrics generation task.


        ### Usage Guide

        - Use this endpoint to check the status of a lyrics generation task

        - Retrieve generated lyrics content once the task is complete

        - Track task progress and access any error information if generation
        failed


        ### Status Descriptions

        - `PENDING`: Task is waiting to be processed

        - `SUCCESS`: Lyrics generated successfully

        - `CREATE_TASK_FAILED`: Failed to create the task

        - `GENERATE_LYRICS_FAILED`: Failed during lyrics generation

        - `CALLBACK_EXCEPTION`: Error occurred during callback

        - `SENSITIVE_WORD_ERROR`: Content filtered due to sensitive words


        ### Developer Notes

        - Successful tasks will include multiple lyrics variations

        - Each lyrics set includes both content and a suggested title

        - Error codes and messages are provided for failed tasks
      operationId: get-lyrics-details
      tags:
        - docs/en/Market/Suno API/Lyrics Generation
      parameters:
        - name: taskId
          in: query
          description: >-
            Unique identifier of the lyrics generation task to retrieve. This is
            the taskId returned when creating the lyrics generation task.
          required: true
          example: 11dc****8b0f
          schema:
            type: string
      responses:
        '200':
          description: Request successful
          content:
            application/json:
              schema:
                allOf:
                  - type: object
                    properties:
                      code:
                        type: integer
                        enum:
                          - 200
                          - 400
                          - 401
                          - 404
                          - 422
                          - 451
                          - 455
                          - 500
                        description: >-
                          Response status code


                          - **200**: Success - Request has been processed
                          successfully

                          - **400**: Please try rephrasing   with more specific
                          details or using a different approach.

                          Song Description contained artist name:

                          Song Description flagged for moderation

                          Unable to generate lyrics from song   description

                          - **401**: Unauthorized - Authentication credentials
                          are missing or invalid

                          - **404**: Not Found - The requested resource or
                          endpoint does not exist

                          - **422**: Validation Error - The request parameters
                          failed validation checks

                          - **451**: Failed to fetch the image. Kindly verify
                          any access limits set by you or your service provider.

                          - **455**: Service Unavailable - System is currently
                          undergoing maintenance

                          - **500**: Server Error - An unexpected error occurred
                          while processing the request

                          Internal Error - Please try again later.
                      msg:
                        type: string
                        description: Error message when code != 200
                        examples:
                          - success
                    x-apidog-orders:
                      - code
                      - msg
                    x-apidog-ignore-properties: []
                  - type: object
                    properties:
                      data:
                        type: object
                        properties:
                          taskId:
                            type: string
                            description: Task ID
                          param:
                            type: string
                            description: Parameter information for task generation
                          response:
                            type: object
                            properties:
                              taskId:
                                type: string
                                description: Task ID
                              data:
                                type: array
                                items:
                                  type: object
                                  properties:
                                    text:
                                      type: string
                                      description: Lyrics content
                                    title:
                                      type: string
                                      description: Lyrics title
                                    status:
                                      type: string
                                      description: Generation status
                                      enum:
                                        - complete
                                        - failed
                                    errorMessage:
                                      type: string
                                      description: >-
                                        Error message, valid when status is
                                        failed
                                  x-apidog-orders:
                                    - text
                                    - title
                                    - status
                                    - errorMessage
                                  x-apidog-ignore-properties: []
                            x-apidog-orders:
                              - taskId
                              - data
                            x-apidog-ignore-properties: []
                          status:
                            type: string
                            description: Task status
                            enum:
                              - PENDING
                              - SUCCESS
                              - CREATE_TASK_FAILED
                              - GENERATE_LYRICS_FAILED
                              - CALLBACK_EXCEPTION
                              - SENSITIVE_WORD_ERROR
                          type:
                            type: string
                            description: Task type
                            examples:
                              - LYRICS
                          errorCode:
                            type: number
                            description: >-
                              Error code, valid when task fails


                              - **200**: Success - Request has been processed
                              successfully

                              - **400**: Please try rephrasing   with more
                              specific details or using a different approach.

                              Song Description contained artist name

                              Song Description flagged for moderation

                              Unable to generate lyrics from song   description

                              - **500**: Internal Error - Please try again
                              later.
                            enum:
                              - 200
                              - 400
                              - 500
                          errorMessage:
                            type: string
                            description: Error message, valid when task fails
                        x-apidog-orders:
                          - taskId
                          - param
                          - response
                          - status
                          - type
                          - errorCode
                          - errorMessage
                        x-apidog-ignore-properties: []
                    x-apidog-orders:
                      - data
                    x-apidog-ignore-properties: []
              example:
                code: 200
                msg: success
                data:
                  taskId: 11dc****8b0f
                  param: '{"prompt":"A song about peaceful night in the city"}'
                  response:
                    taskId: 11dc****8b0f
                    data:
                      - text: |-
                          [Verse]
                          我穿越城市黑暗夜
                          心中燃烧梦想的烈火
                        title: 钢铁侠
                        status: complete
                        errorMessage: ''
                  status: SUCCESS
                  type: LYRICS
                  errorCode: null
                  errorMessage: null
          headers: {}
          x-apidog-name: ''
        '500':
          description: request failed
          content:
            application/json:
              schema:
                type: object
                properties:
                  code:
                    type: integer
                    description: >-
                      Response status code


                      - **200**: Success - Request has been processed
                      successfully

                      - **401**: Unauthorized - Authentication credentials are
                      missing or invalid

                      - **402**: Insufficient Credits - Account does not have
                      enough credits to perform the operation

                      - **404**: Not Found - The requested resource or endpoint
                      does not exist

                      - **422**: Validation Error - The request parameters
                      failed validation checks

                      - **429**: Rate Limited - Request limit has been exceeded
                      for this resource

                      - **455**: Service Unavailable - System is currently
                      undergoing maintenance

                      - **500**: Server Error - An unexpected error occurred
                      while processing the request

                      - **501**: Generation Failed - Content generation task
                      failed

                      - **505**: Feature Disabled - The requested feature is
                      currently disabled
                  msg:
                    type: string
                    description: Response message, error description when failed
                  data:
                    type: object
                    properties: {}
                    x-apidog-orders: []
                    x-apidog-ignore-properties: []
                x-apidog-orders:
                  - code
                  - msg
                  - data
                required:
                  - code
                  - msg
                  - data
                x-apidog-ignore-properties: []
              example:
                code: 500
                msg: >-
                  Server Error - An unexpected error occurred while processing
                  the request
                data: null
          headers: {}
          x-apidog-name: 'Error '
      security:
        - BearerAuth: []
          x-apidog:
            schemeGroups:
              - id: kn8M4YUlc5i0A0179ezwx
                schemeIds:
                  - BearerAuth
            required: true
            use:
              id: kn8M4YUlc5i0A0179ezwx
            scopes:
              kn8M4YUlc5i0A0179ezwx:
                BearerAuth: []
      x-apidog-folder: docs/en/Market/Suno API/Lyrics Generation
      x-apidog-status: released
      x-run-in-apidog: https://app.apidog.com/web/project/1184766/apis/api-28506297-run
components:
  schemas: {}
  securitySchemes:
    BearerAuth:
      type: bearer
      scheme: bearer
      bearerFormat: API Key
      description: |-
        所有 API 均需要通过 Bearer Token 进行身份验证。

        获取 API Key：
        1. 访问 [API Key 管理页面](https://kie.ai/api-key) 获取您的 API Key

        使用方法：
        在请求头中添加：
        Authorization: Bearer YOUR_API_KEY

        注意：
        - 请妥善保管您的 API Key，不要与他人分享
        - 如果您怀疑 API Key 已泄露，请立即在管理页面重置
servers:
  - url: https://api.kie.ai
    description: 正式环境
security:
  - BearerAuth: []
    x-apidog:
      schemeGroups:
        - id: kn8M4YUlc5i0A0179ezwx
          schemeIds:
            - BearerAuth
      required: true
      use:
        id: kn8M4YUlc5i0A0179ezwx
      scopes:
        kn8M4YUlc5i0A0179ezwx:
          BearerAuth: []

```


# ========== convert-to-wav ==========

# Convert to WAV Format

## OpenAPI Specification

```yaml
openapi: 3.0.1
info:
  title: ''
  description: ''
  version: 1.0.0
paths:
  /api/v1/wav/generate:
    post:
      summary: Convert to WAV Format
      deprecated: false
      description: >-
        Convert an existing music track to high-quality WAV format.


        ### Usage Guide

        - Use this endpoint to obtain WAV format files from your generated music

        - WAV files provide uncompressed audio for professional editing and
        processing

        - Converted files maintain the full quality of the original audio


        ### Parameter Details

        - `taskId` identifies the original music generation task

        - `audioId` specifies which audio track to convert when multiple
        variations exist


        ### Developer Notes

        - Generated WAV files are retained for 14 days

        - WAV files are typically 5-10 times larger than MP3 equivalents

        - Processing time may vary depending on the length of the original audio
      operationId: convert-to-wav
      tags:
        - docs/en/Market/Suno API/WAV Conversion
      parameters: []
      requestBody:
        content:
          application/json:
            schema:
              type: object
              required:
                - taskId
                - audioId
                - callBackUrl
              properties:
                taskId:
                  type: string
                  description: >-
                    Unique identifier of the music generation task. This should
                    be a taskId returned from either the "Generate Music" or
                    "Extend Music" endpoints.
                  examples:
                    - 5c79****be8e
                audioId:
                  type: string
                  description: >-
                    Unique identifier of the specific audio track to convert.
                    This ID is returned in the callback data after music
                    generation completes.
                  examples:
                    - e231****-****-****-****-****8cadc7dc
                callBackUrl:
                  type: string
                  format: uri
                  description: >-
                    The URL to receive WAV conversion task completion updates.
                    Required for all WAV conversion requests.


                    - System will POST task status and results to this URL when
                    WAV conversion completes

                    - Callback includes the high-quality WAV file download URL

                    - Your callback endpoint should accept POST requests with
                    JSON payload containing the WAV file location

                    - For detailed callback format and implementation guide, see
                    [WAV Conversion
                    Callbacks](https://docs.kie.ai/suno-api/convert-to-wav-callbacks)

                    - Alternatively, use the Get WAV Details endpoint to poll
                    task status

                    - To ensure callback security, see [Webhook Verification
                    Guide](/common-api/webhook-verification) for signature
                    verification implementation
                  examples:
                    - https://api.example.com/callback
              x-apidog-orders:
                - taskId
                - audioId
                - callBackUrl
              x-apidog-ignore-properties: []
            example:
              taskId: 5c79****be8e
              audioId: e231****-****-****-****-****8cadc7dc
              callBackUrl: https://api.example.com/callback
      responses:
        '200':
          description: Request successful
          content:
            application/json:
              schema:
                allOf:
                  - type: object
                    properties:
                      code:
                        type: integer
                        enum:
                          - 200
                          - 400
                          - 401
                          - 402
                          - 404
                          - 409
                          - 422
                          - 429
                          - 455
                          - 500
                        description: >-
                          Response status code


                          - **200**: Success - Request has been processed
                          successfully

                          - **400**: Format Error - The parameter is not in a
                          valid JSON format.

                          - **401**: Unauthorized - Authentication credentials
                          are missing or invalid

                          - **402**: Insufficient Credits - Account does not
                          have enough credits to perform the operation

                          - **404**: Not Found - The requested resource or
                          endpoint does not exist

                          - **409**: Conflict - WAV record already exists

                          - **422**: Validation Error - The request parameters
                          failed validation checks

                          - **429**: Rate Limited - Request limit has been
                          exceeded for this resource

                          - **455**: Service Unavailable - System is currently
                          undergoing maintenance

                          - **500**: Server Error - An unexpected error occurred
                          while processing the request

                          Build Failed - Audio wav generation failed
                      msg:
                        type: string
                        description: Error message when code != 200
                        examples:
                          - success
                    x-apidog-orders:
                      - code
                      - msg
                    x-apidog-ignore-properties: []
                  - type: object
                    properties:
                      data:
                        type: object
                        properties:
                          taskId:
                            type: string
                            description: Task ID for tracking task status
                            examples:
                              - 5c79****be8e
                        x-apidog-orders:
                          - taskId
                        x-apidog-ignore-properties: []
                    x-apidog-orders:
                      - data
                    x-apidog-ignore-properties: []
          headers: {}
          x-apidog-name: ''
        '500':
          description: request failed
          content:
            application/json:
              schema:
                type: object
                properties:
                  code:
                    type: integer
                    description: >-
                      Response status code


                      - **200**: Success - Request has been processed
                      successfully

                      - **401**: Unauthorized - Authentication credentials are
                      missing or invalid

                      - **402**: Insufficient Credits - Account does not have
                      enough credits to perform the operation

                      - **404**: Not Found - The requested resource or endpoint
                      does not exist

                      - **422**: Validation Error - The request parameters
                      failed validation checks

                      - **429**: Rate Limited - Request limit has been exceeded
                      for this resource

                      - **455**: Service Unavailable - System is currently
                      undergoing maintenance

                      - **500**: Server Error - An unexpected error occurred
                      while processing the request

                      - **501**: Generation Failed - Content generation task
                      failed

                      - **505**: Feature Disabled - The requested feature is
                      currently disabled
                  msg:
                    type: string
                    description: Response message, error description when failed
                  data:
                    type: object
                    properties: {}
                    x-apidog-orders: []
                    x-apidog-ignore-properties: []
                x-apidog-orders:
                  - code
                  - msg
                  - data
                required:
                  - code
                  - msg
                  - data
                x-apidog-ignore-properties: []
              example:
                code: 500
                msg: >-
                  Server Error - An unexpected error occurred while processing
                  the request
                data: null
          headers: {}
          x-apidog-name: 'Error '
      security:
        - BearerAuth: []
          x-apidog:
            schemeGroups:
              - id: kn8M4YUlc5i0A0179ezwx
                schemeIds:
                  - BearerAuth
            required: true
            use:
              id: kn8M4YUlc5i0A0179ezwx
            scopes:
              kn8M4YUlc5i0A0179ezwx:
                BearerAuth: []
      callbacks:
        wavGenerated:
          '{$request.body#/callBackUrl}':
            post:
              description: >-
                System will call this callback when WAV format audio generation
                is complete.


                ### Callback Example

                ```json

                {
                  "code": 200,
                  "msg": "success",
                  "data": {
                    "audioWavUrl": "https://example.com/s/04e6****e727.wav",
                    "task_id": "988e****c8d3"
                  }
                }

                ```
              requestBody:
                content:
                  application/json:
                    schema:
                      allOf:
                        - type: object
                          properties:
                            code:
                              type: integer
                              enum:
                                - 200
                                - 500
                              description: >-
                                Response status code


                                - **200**: Success - Request has been processed
                                successfully

                                - **500**: Internal Error - Please try again
                                later.
                            msg:
                              type: string
                              description: Error message when code != 200
                              example: success
                        - type: object
                          properties:
                            data:
                              type: object
                              properties:
                                taskId:
                                  type: string
                                  description: Task ID for tracking task status
                                  example: 5c79****be8e
                      type: object
                      properties:
                        code:
                          type: integer
                          description: Status code
                          example: 200
                        msg:
                          type: string
                          description: Response message
                          example: success
                        data:
                          type: object
                          properties:
                            task_id:
                              type: string
                              description: Task ID
                            audioWavUrl:
                              type: string
                              description: WAV format audio file URL
              responses:
                '200':
                  description: Callback received successfully
      x-apidog-folder: docs/en/Market/Suno API/WAV Conversion
      x-apidog-status: released
      x-run-in-apidog: https://app.apidog.com/web/project/1184766/apis/api-28506298-run
components:
  schemas: {}
  securitySchemes:
    BearerAuth:
      type: bearer
      scheme: bearer
      bearerFormat: API Key
      description: |-
        所有 API 均需要通过 Bearer Token 进行身份验证。

        获取 API Key：
        1. 访问 [API Key 管理页面](https://kie.ai/api-key) 获取您的 API Key

        使用方法：
        在请求头中添加：
        Authorization: Bearer YOUR_API_KEY

        注意：
        - 请妥善保管您的 API Key，不要与他人分享
        - 如果您怀疑 API Key 已泄露，请立即在管理页面重置
servers:
  - url: https://api.kie.ai
    description: 正式环境
security:
  - BearerAuth: []
    x-apidog:
      schemeGroups:
        - id: kn8M4YUlc5i0A0179ezwx
          schemeIds:
            - BearerAuth
      required: true
      use:
        id: kn8M4YUlc5i0A0179ezwx
      scopes:
        kn8M4YUlc5i0A0179ezwx:
          BearerAuth: []

```


# ========== get-wav-details ==========

# Get WAV Conversion Details

## OpenAPI Specification

```yaml
openapi: 3.0.1
info:
  title: ''
  description: ''
  version: 1.0.0
paths:
  /api/v1/wav/record-info:
    get:
      summary: Get WAV Conversion Details
      deprecated: false
      description: >-
        Retrieve detailed information about a WAV format conversion task.


        ### Usage Guide

        - Use this endpoint to check the status of a WAV conversion task

        - Access the WAV file URL once conversion is complete

        - Track conversion progress and any errors that may have occurred


        ### Status Descriptions

        - `PENDING`: Task is waiting to be processed

        - `SUCCESS`: WAV conversion completed successfully

        - `CREATE_TASK_FAILED`: Failed to create the conversion task

        - `GENERATE_WAV_FAILED`: Failed during WAV file generation

        - `CALLBACK_EXCEPTION`: Error occurred during callback


        ### Developer Notes

        - The WAV file URL is only available in the response when status is
        `SUCCESS`

        - Error codes and messages are provided for failed tasks

        - WAV files are retained for 14 days after successful conversion
      operationId: get-wav-details
      tags:
        - docs/en/Market/Suno API/WAV Conversion
      parameters:
        - name: taskId
          in: query
          description: >-
            Unique identifier of the WAV conversion task to retrieve. This is
            the taskId returned when creating the WAV conversion task.
          required: true
          example: 988e****c8d3
          schema:
            type: string
      responses:
        '200':
          description: Request successful
          content:
            application/json:
              schema:
                allOf:
                  - type: object
                    properties:
                      code:
                        type: integer
                        enum:
                          - 200
                          - 401
                          - 404
                          - 422
                          - 451
                          - 455
                          - 500
                        description: >-
                          Response status code


                          - **200**: Success - Request has been processed
                          successfully

                          - **401**: Unauthorized - Authentication credentials
                          are missing or invalid

                          - **404**: Not Found - The requested resource or
                          endpoint does not exist

                          - **422**: Validation Error - The request parameters
                          failed validation checks

                          - **451**: Failed to fetch the image. Kindly verify
                          any access limits set by you or your service provider.

                          - **455**: Service Unavailable - System is currently
                          undergoing maintenance

                          - **500**: Server Error - An unexpected error occurred
                          while processing the request
                      msg:
                        type: string
                        description: Error message when code != 200
                        examples:
                          - success
                    x-apidog-orders:
                      - code
                      - msg
                    x-apidog-ignore-properties: []
                  - type: object
                    properties:
                      data:
                        type: object
                        properties:
                          taskId:
                            type: string
                            description: Task ID
                          musicId:
                            type: string
                            description: Music ID
                          callbackUrl:
                            type: string
                            description: Callback address
                          musicIndex:
                            type: integer
                            description: Music index 0 or 1
                          completeTime:
                            type: string
                            description: Complete callback time
                            format: date-time
                          response:
                            type: object
                            properties:
                              audioWavUrl:
                                type: string
                                description: WAV format audio file URL
                            x-apidog-orders:
                              - audioWavUrl
                            x-apidog-ignore-properties: []
                          successFlag:
                            type: string
                            description: Task status
                            enum:
                              - PENDING
                              - SUCCESS
                              - CREATE_TASK_FAILED
                              - GENERATE_WAV_FAILED
                              - CALLBACK_EXCEPTION
                          createTime:
                            type: string
                            description: Creation time
                            format: date-time
                          errorCode:
                            type: number
                            description: >-
                              Error code, valid when task fails


                              - **200**: Success - Request has been processed
                              successfully

                              - **500**: Internal Error - Please try again
                              later.
                            enum:
                              - 200
                              - 500
                          errorMessage:
                            type: string
                            description: Error message, valid when task fails
                        x-apidog-orders:
                          - taskId
                          - musicId
                          - callbackUrl
                          - musicIndex
                          - completeTime
                          - response
                          - successFlag
                          - createTime
                          - errorCode
                          - errorMessage
                        x-apidog-ignore-properties: []
                    x-apidog-orders:
                      - data
                    x-apidog-ignore-properties: []
              example:
                code: 200
                msg: success
                data:
                  taskId: 988e****c8d3
                  musicId: e231****-****-****-****-****8cadc7dc
                  callbackUrl: https://api.example.com/callback
                  musicIndex: 0
                  completeTime: '2025-01-01 00:10:00'
                  response:
                    audioWavUrl: https://example.com/s/04e6****e727.wav
                  successFlag: SUCCESS
                  createTime: '2025-01-01 00:00:00'
                  errorCode: null
                  errorMessage: null
          headers: {}
          x-apidog-name: ''
        '500':
          description: request failed
          content:
            application/json:
              schema:
                type: object
                properties:
                  code:
                    type: integer
                    description: >-
                      Response status code


                      - **200**: Success - Request has been processed
                      successfully

                      - **401**: Unauthorized - Authentication credentials are
                      missing or invalid

                      - **402**: Insufficient Credits - Account does not have
                      enough credits to perform the operation

                      - **404**: Not Found - The requested resource or endpoint
                      does not exist

                      - **422**: Validation Error - The request parameters
                      failed validation checks

                      - **429**: Rate Limited - Request limit has been exceeded
                      for this resource

                      - **455**: Service Unavailable - System is currently
                      undergoing maintenance

                      - **500**: Server Error - An unexpected error occurred
                      while processing the request

                      - **501**: Generation Failed - Content generation task
                      failed

                      - **505**: Feature Disabled - The requested feature is
                      currently disabled
                  msg:
                    type: string
                    description: Response message, error description when failed
                  data:
                    type: object
                    properties: {}
                    x-apidog-orders: []
                    x-apidog-ignore-properties: []
                x-apidog-orders:
                  - code
                  - msg
                  - data
                required:
                  - code
                  - msg
                  - data
                x-apidog-ignore-properties: []
              example:
                code: 500
                msg: >-
                  Server Error - An unexpected error occurred while processing
                  the request
                data: null
          headers: {}
          x-apidog-name: 'Error '
      security:
        - BearerAuth: []
          x-apidog:
            schemeGroups:
              - id: kn8M4YUlc5i0A0179ezwx
                schemeIds:
                  - BearerAuth
            required: true
            use:
              id: kn8M4YUlc5i0A0179ezwx
            scopes:
              kn8M4YUlc5i0A0179ezwx:
                BearerAuth: []
      x-apidog-folder: docs/en/Market/Suno API/WAV Conversion
      x-apidog-status: released
      x-run-in-apidog: https://app.apidog.com/web/project/1184766/apis/api-28506299-run
components:
  schemas: {}
  securitySchemes:
    BearerAuth:
      type: bearer
      scheme: bearer
      bearerFormat: API Key
      description: |-
        所有 API 均需要通过 Bearer Token 进行身份验证。

        获取 API Key：
        1. 访问 [API Key 管理页面](https://kie.ai/api-key) 获取您的 API Key

        使用方法：
        在请求头中添加：
        Authorization: Bearer YOUR_API_KEY

        注意：
        - 请妥善保管您的 API Key，不要与他人分享
        - 如果您怀疑 API Key 已泄露，请立即在管理页面重置
servers:
  - url: https://api.kie.ai
    description: 正式环境
security:
  - BearerAuth: []
    x-apidog:
      schemeGroups:
        - id: kn8M4YUlc5i0A0179ezwx
          schemeIds:
            - BearerAuth
      required: true
      use:
        id: kn8M4YUlc5i0A0179ezwx
      scopes:
        kn8M4YUlc5i0A0179ezwx:
          BearerAuth: []

```


# ========== separate-vocals ==========

# Vocal & Instrument Stem Separation

## OpenAPI Specification

```yaml
openapi: 3.0.1
info:
  title: ''
  description: ''
  version: 1.0.0
paths:
  /api/v1/vocal-removal/generate:
    post:
      summary: Vocal & Instrument Stem Separation
      deprecated: false
      description: "Separate music into vocal, instrumental, and individual instrument tracks using advanced audio processing technology.\n\n### Usage Guide\n\n- Separate a platform‑generated mix into vocal, instrumental, and individual instrument components.\n- Two processing modes are available:\n  - `separate_vocal` — 2‑stem split\n  - `split_stem`   — up to 12‑stem split\n- Ideal for karaoke creation, remixes, sample extraction, or detailed post‑production.\n- Best results on professionally mixed AI tracks with clear vocal and instrumental layers.\n- **Billing notice:** Each call consumes credits; **re‑calling the same track is charged again** (no server‑side caching).\n- **Pricing:** Check current per‑call credit costs at [**https://kie.ai/pricing**](https://kie.ai/pricing).\n\n### Separation Mode Details\n\n| **Mode (<code>type</code>)** | **Stems Returned** | **Typical Use** | **Credit Cost** |\n| :--------------------------- | :--------------------------------------------------------------------------------------------------------------------------------- | :------------------------------------------ | :----------------------------- |\n| `separate_vocal` _(default)_ | **2 stems** – Vocals \\+ Instrumental                                                                                               | Quick vocal removal, karaoke, basic remixes | **10 Credits**  |\n| `split_stem`                 | **Up to 12 stems** – Vocals, Backing Vocals, Drums, Bass, Guitar, Keyboard, Strings, Brass, Woodwinds, Percussion, Synth, FX/Other | Advanced mixing, remixing, sound design     | **50 Credits** |\n\n### Parameter\_Reference\n\n| Name      | Type   | Description                                                     |\n| :-------- | :----- | :-------------------------------------------------------------- |\n| `taskId`  | string | ID of the original music‑generation task                        |\n| `audioId` | string | Which audio variation to process when multiple versions exist   |\n| `type`    | string | **Required.** Separation mode: `separate_vocal` or `split_stem` |\n\n### Developer Notes\n\n- All returned audio‑file URLs remain accessible for **14 days**.\n- Separation quality depends on the complexity and mixing of the original track.\n- `separate_vocal` returns **2 stems** — vocals \\+ instrumental.\n- `split_stem` returns **up to 12 independent stems** — vocals, backing vocals, drums, bass, guitar, keyboard, strings, brass, woodwinds, percussion, synth, FX/other.\n- **Billing:** Every request is charged. Re‑submitting the same track triggers **a new credit deduction** (no server‑side caching)."
      operationId: separate-vocals
      tags:
        - docs/en/Market/Suno API/Vocal Removal
      parameters: []
      requestBody:
        content:
          application/json:
            schema:
              type: object
              required:
                - taskId
                - audioId
                - callBackUrl
              properties:
                taskId:
                  type: string
                  description: >-
                    Unique identifier of the music generation task. This should
                    be a taskId returned from either the "Generate Music" or
                    "Extend Music" endpoints.
                  examples:
                    - 5c79****be8e
                audioId:
                  type: string
                  description: >-
                    Unique identifier of the specific audio track to process for
                    vocal separation. This ID is returned in the callback data
                    after music generation completes.
                  examples:
                    - e231****-****-****-****-****8cadc7dc
                type:
                  type: string
                  enum:
                    - separate_vocal
                    - split_stem
                  default: separate_vocal
                  description: >-
                    Separation type with the following options:


                    - **separate_vocal**: Separate vocals and accompaniment,
                    generating vocal and instrumental tracks

                    - **split_stem**: Separate various instrument sounds,
                    generating vocals, backing vocals, drums, bass, guitar,
                    keyboard, strings, brass, woodwinds, percussion,
                    synthesizer, effects, and other tracks
                  examples:
                    - separate_vocal
                callBackUrl:
                  type: string
                  format: uri
                  description: >-
                    The URL to receive vocal separation task completion updates.
                    Required for all vocal separation requests.


                    - System will POST task status and results to this URL when
                    vocal separation completes

                    - Callback content varies based on the type parameter:
                    separate_vocal returns vocals and accompaniment, split_stem
                    returns multiple instrument tracks

                    - Your callback endpoint should accept POST requests with
                    JSON payload containing separated audio file links

                    - For detailed callback format and implementation guide, see
                    [Vocal Separation
                    Callbacks](https://docs.kie.ai/suno-api/separate-vocals-callbacks)

                    - Alternatively, use the Get Vocal Separation Details
                    endpoint to poll task status

                    - To ensure callback security, see [Webhook Verification
                    Guide](/common-api/webhook-verification) for signature
                    verification implementation
                  examples:
                    - https://api.example.com/callback
              x-apidog-orders:
                - taskId
                - audioId
                - type
                - callBackUrl
              x-apidog-ignore-properties: []
            example:
              taskId: 5c79****be8e
              audioId: e231****-****-****-****-****8cadc7dc
              callBackUrl: https://api.example.com/callback
              type: separate_vocal
      responses:
        '200':
          description: Request successful
          content:
            application/json:
              schema:
                allOf:
                  - type: object
                    properties:
                      code:
                        type: integer
                        enum:
                          - 200
                          - 400
                          - 401
                          - 402
                          - 404
                          - 409
                          - 422
                          - 429
                          - 455
                          - 500
                        description: >-
                          Response status code


                          - **200**: Success - Request has been processed
                          successfully

                          - **400**: Format Error - The parameter is not in a
                          valid JSON format

                          - **401**: Unauthorized - Authentication credentials
                          are missing or invalid

                          - **402**: Insufficient Credits - Account does not
                          have enough credits to perform the operation

                          - **404**: Not Found - The requested resource or
                          endpoint does not exist

                          - **409**: Conflict - WAV record already exists

                          - **422**: Validation Error - The request parameters
                          failed validation checks

                          - **429**: Rate Limited - Request limit has been
                          exceeded for this resource

                          - **455**: Service Unavailable - System is currently
                          undergoing maintenance

                          - **500**: Server Error - An unexpected error occurred
                          while processing the request
                      msg:
                        type: string
                        description: Error message when code != 200
                        examples:
                          - success
                    x-apidog-orders:
                      - code
                      - msg
                    x-apidog-ignore-properties: []
                  - type: object
                    properties:
                      data:
                        type: object
                        properties:
                          taskId:
                            type: string
                            description: Task ID for tracking task status
                            examples:
                              - 5c79****be8e
                        x-apidog-orders:
                          - taskId
                        x-apidog-ignore-properties: []
                    x-apidog-orders:
                      - data
                    x-apidog-ignore-properties: []
          headers: {}
          x-apidog-name: ''
        '500':
          description: request failed
          content:
            application/json:
              schema:
                type: object
                properties:
                  code:
                    type: integer
                    description: >-
                      Response status code


                      - **200**: Success - Request has been processed
                      successfully

                      - **401**: Unauthorized - Authentication credentials are
                      missing or invalid

                      - **402**: Insufficient Credits - Account does not have
                      enough credits to perform the operation

                      - **404**: Not Found - The requested resource or endpoint
                      does not exist

                      - **422**: Validation Error - The request parameters
                      failed validation checks

                      - **429**: Rate Limited - Request limit has been exceeded
                      for this resource

                      - **455**: Service Unavailable - System is currently
                      undergoing maintenance

                      - **500**: Server Error - An unexpected error occurred
                      while processing the request

                      - **501**: Generation Failed - Content generation task
                      failed

                      - **505**: Feature Disabled - The requested feature is
                      currently disabled
                  msg:
                    type: string
                    description: Response message, error description when failed
                  data:
                    type: object
                    properties: {}
                    x-apidog-orders: []
                    x-apidog-ignore-properties: []
                x-apidog-orders:
                  - code
                  - msg
                  - data
                required:
                  - code
                  - msg
                  - data
                x-apidog-ignore-properties: []
              example:
                code: 500
                msg: >-
                  Server Error - An unexpected error occurred while processing
                  the request
                data: null
          headers: {}
          x-apidog-name: 'Error '
      security:
        - BearerAuth: []
          x-apidog:
            schemeGroups:
              - id: kn8M4YUlc5i0A0179ezwx
                schemeIds:
                  - BearerAuth
            required: true
            use:
              id: kn8M4YUlc5i0A0179ezwx
            scopes:
              kn8M4YUlc5i0A0179ezwx:
                BearerAuth: []
      callbacks:
        vocalRemovalGenerated:
          '{$request.body#/callBackUrl}':
            post:
              description: >-
                System will call this callback when vocal separation is
                complete. Callback data structure varies based on the type
                parameter specified in the request.


                ### separate_vocal Type Callback Example

                ```json

                {
                  "code": 200,
                  "msg": "vocal separation generated successfully.",
                  "data": {
                    "task_id": "3e63b4cc88d52611159371f6af5571e7",
                    "vocal_separation_info": {
                      "instrumental_url": "https://file.aiquickdraw.com/s/d92a13bf-c6f4-4ade-bb47-f69738435528_Instrumental.mp3",
                      "origin_url": "",
                      "vocal_url": "https://file.aiquickdraw.com/s/3d7021c9-fa8b-4eda-91d1-3b9297ddb172_Vocals.mp3"
                    }
                  }
                }

                ```


                ### split_stem Type Callback Example

                ```json

                {
                  "code": 200,
                  "msg": "vocal separation generated successfully.",
                  "data": {
                    "task_id": "e649edb7abfd759285bd41a47a634b10",
                    "vocal_separation_info": {
                      "origin_url": "",
                      "backing_vocals_url": "https://file.aiquickdraw.com/s/aadc51a3-4c88-4c8e-a4c8-e867c539673d_Backing_Vocals.mp3",
                      "bass_url": "https://file.aiquickdraw.com/s/a3c2da5a-b364-4422-adb5-2692b9c26d33_Bass.mp3",
                      "brass_url": "https://file.aiquickdraw.com/s/334b2d23-0c65-4a04-92c7-22f828afdd44_Brass.mp3",
                      "drums_url": "https://file.aiquickdraw.com/s/ac75c5ea-ac77-4ad2-b7d9-66e140b78e44_Drums.mp3",
                      "fx_url": "https://file.aiquickdraw.com/s/a8822c73-6629-4089-8f2a-d19f41f0007d_FX.mp3",
                      "guitar_url": "https://file.aiquickdraw.com/s/064dd08e-d5d2-4201-9058-c5c40fb695b4_Guitar.mp3",
                      "keyboard_url": "https://file.aiquickdraw.com/s/adc934e0-df7d-45da-8220-1dba160d74e0_Keyboard.mp3",
                      "percussion_url": "https://file.aiquickdraw.com/s/0f70884d-047c-41f1-a6d0-7044618b7dc6_Percussion.mp3",
                      "strings_url": "https://file.aiquickdraw.com/s/49829425-a5b0-424e-857a-75d4c63a426b_Strings.mp3",
                      "synth_url": "https://file.aiquickdraw.com/s/56b2d94a-eb92-4d21-bc43-3460de0c8348_Synth.mp3",
                      "vocal_url": "https://file.aiquickdraw.com/s/07420749-29a2-4054-9b62-e6a6f8b90ccb_Vocals.mp3",
                      "woodwinds_url": "https://file.aiquickdraw.com/s/d81545b1-6f94-4388-9785-1aaa6ecabb02_Woodwinds.mp3"
                    }
                  }
                }

                ```
              requestBody:
                content:
                  application/json:
                    schema:
                      allOf:
                        - type: object
                          properties:
                            code:
                              type: integer
                              enum:
                                - 200
                                - 500
                              description: >-
                                Response status code


                                - **200**: Success - Request has been processed
                                successfully

                                - **500**: Internal Error - Please try again
                                later.
                            msg:
                              type: string
                              description: Error message when code != 200
                              example: success
                        - type: object
                          properties:
                            data:
                              type: object
                              properties:
                                taskId:
                                  type: string
                                  description: Task ID for tracking task status
                                  example: 5c79****be8e
                      type: object
                      properties:
                        code:
                          type: integer
                          description: Status code
                          example: 200
                        msg:
                          type: string
                          description: Response message
                          example: vocal separation generated successfully.
                        data:
                          type: object
                          properties:
                            task_id:
                              type: string
                              description: Task ID
                            vocal_separation_info:
                              type: object
                              description: >-
                                Vocal separation result information, fields vary
                                based on the type parameter in the request
                              properties:
                                origin_url:
                                  type: string
                                  description: Original audio URL
                                vocal_url:
                                  type: string
                                  description: Vocal part audio URL
                                instrumental_url:
                                  type: string
                                  description: >-
                                    Instrumental part audio URL (separate_vocal
                                    type only)
                                backing_vocals_url:
                                  type: string
                                  description: >-
                                    Backing vocals audio URL (split_stem type
                                    only)
                                drums_url:
                                  type: string
                                  description: Drums part audio URL (split_stem type only)
                                bass_url:
                                  type: string
                                  description: Bass part audio URL (split_stem type only)
                                guitar_url:
                                  type: string
                                  description: Guitar part audio URL (split_stem type only)
                                keyboard_url:
                                  type: string
                                  description: >-
                                    Keyboard part audio URL (split_stem type
                                    only)
                                percussion_url:
                                  type: string
                                  description: >-
                                    Percussion part audio URL (split_stem type
                                    only)
                                strings_url:
                                  type: string
                                  description: >-
                                    Strings part audio URL (split_stem type
                                    only)
                                synth_url:
                                  type: string
                                  description: >-
                                    Synthesizer part audio URL (split_stem type
                                    only)
                                fx_url:
                                  type: string
                                  description: >-
                                    Effects part audio URL (split_stem type
                                    only)
                                brass_url:
                                  type: string
                                  description: Brass part audio URL (split_stem type only)
                                woodwinds_url:
                                  type: string
                                  description: >-
                                    Woodwinds part audio URL (split_stem type
                                    only)
              responses:
                '200':
                  description: Callback received successfully
      x-apidog-folder: docs/en/Market/Suno API/Vocal Removal
      x-apidog-status: released
      x-run-in-apidog: https://app.apidog.com/web/project/1184766/apis/api-28506300-run
components:
  schemas: {}
  securitySchemes:
    BearerAuth:
      type: bearer
      scheme: bearer
      bearerFormat: API Key
      description: |-
        所有 API 均需要通过 Bearer Token 进行身份验证。

        获取 API Key：
        1. 访问 [API Key 管理页面](https://kie.ai/api-key) 获取您的 API Key

        使用方法：
        在请求头中添加：
        Authorization: Bearer YOUR_API_KEY

        注意：
        - 请妥善保管您的 API Key，不要与他人分享
        - 如果您怀疑 API Key 已泄露，请立即在管理页面重置
servers:
  - url: https://api.kie.ai
    description: 正式环境
security:
  - BearerAuth: []
    x-apidog:
      schemeGroups:
        - id: kn8M4YUlc5i0A0179ezwx
          schemeIds:
            - BearerAuth
      required: true
      use:
        id: kn8M4YUlc5i0A0179ezwx
      scopes:
        kn8M4YUlc5i0A0179ezwx:
          BearerAuth: []

```


# ========== get-vocal-separation-details ==========

# Get Vocal Separation Details

## OpenAPI Specification

```yaml
openapi: 3.0.1
info:
  title: ''
  description: ''
  version: 1.0.0
paths:
  /api/v1/vocal-removal/record-info:
    get:
      summary: Get Vocal Separation Details
      deprecated: false
      description: >-
        Retrieve detailed information about a vocal separation task.


        ### Usage Guide

        - Use this endpoint to check the status of a vocal separation task

        - Access the URLs for vocal, instrumental, and individual instrument
        tracks once processing is complete

        - Track processing progress and any errors that may have occurred

        - Supports querying results for both `separate_vocal` and `split_stem`
        separation types


        ### Status Descriptions

        - `PENDING`: Task is waiting to be processed

        - `SUCCESS`: Vocal separation completed successfully

        - `CREATE_TASK_FAILED`: Failed to create the separation task

        - `GENERATE_AUDIO_FAILED`: Failed during audio processing

        - `CALLBACK_EXCEPTION`: Error occurred during callback


        ### Response Data Structure Description

        - `separate_vocal` type: Returns `instrumentalUrl` and `vocalUrl`
        fields, other instrument fields are null

        - `split_stem` type: Returns detailed instrument separation fields,
        `instrumentalUrl` is null


        ### Developer Notes

        - Separated audio file URLs are only available when status is `SUCCESS`

        - Error codes and messages are provided for failed tasks

        - Separated audio files are retained for 14 days after successful
        processing

        - Field structure varies based on the `type` parameter from the original
        request
      operationId: get-vocal-separation-details
      tags:
        - docs/en/Market/Suno API/Vocal Removal
      parameters:
        - name: taskId
          in: query
          description: >-
            Unique identifier of the vocal separation task to retrieve. This is
            the taskId returned when creating the vocal separation task.
          required: true
          example: 5e72****97c7
          schema:
            type: string
      responses:
        '200':
          description: Request successful
          content:
            application/json:
              schema:
                allOf:
                  - type: object
                    properties:
                      code:
                        type: integer
                        enum:
                          - 200
                          - 401
                          - 404
                          - 422
                          - 451
                          - 455
                          - 500
                        description: >-
                          Response status code


                          - **200**: Success - Request has been processed
                          successfully

                          - **401**: Unauthorized - Authentication credentials
                          are missing or invalid

                          - **404**: Not Found - The requested resource or
                          endpoint does not exist

                          - **422**: Validation Error - The request parameters
                          failed validation checks

                          - **451**: Failed to fetch the image. Kindly verify
                          any access limits set by you or your service provider.

                          - **455**: Service Unavailable - System is currently
                          undergoing maintenance

                          - **500**: Server Error - An unexpected error occurred
                          while processing the request
                      msg:
                        type: string
                        description: Error message when code != 200
                        examples:
                          - success
                    x-apidog-orders:
                      - code
                      - msg
                    x-apidog-ignore-properties: []
                  - type: object
                    properties:
                      data:
                        type: object
                        properties:
                          taskId:
                            type: string
                            description: Task ID
                          musicId:
                            type: string
                            description: Music ID
                          callbackUrl:
                            type: string
                            description: Callback address
                          musicIndex:
                            type: integer
                            description: Music index 0 or 1
                          completeTime:
                            type: string
                            description: Complete callback time
                            format: date-time
                          response:
                            type: object
                            description: >-
                              Vocal separation response result, fields vary
                              based on the type parameter from the original
                              request
                            properties:
                              id:
                                type: string
                                description: Response ID
                                nullable: true
                              originUrl:
                                type: string
                                description: Original audio URL
                              originData:
                                type: array
                                description: Array of separated audio track information
                                items:
                                  type: object
                                  properties:
                                    duration:
                                      type: number
                                      description: Audio duration in seconds
                                      examples:
                                        - 339.8
                                    audio_url:
                                      type: string
                                      format: uri
                                      description: URL of the separated audio track
                                      examples:
                                        - https://example.mp3
                                    stem_type_group_name:
                                      type: string
                                      description: >-
                                        Name of the stem type group (e.g.,
                                        Vocals, Instrumental, Drums, Bass, etc.)
                                      examples:
                                        - Vocals
                                    id:
                                      type: string
                                      description: >-
                                        Unique identifier for the audio track.
                                        This ID can be used as audioId parameter
                                        in MIDI generation.
                                      examples:
                                        - 8ca376e7-2693-48d2-875d-08aaf2c6dd27
                                  x-apidog-orders:
                                    - duration
                                    - audio_url
                                    - stem_type_group_name
                                    - id
                                  x-apidog-ignore-properties: []
                              instrumentalUrl:
                                type: string
                                description: >-
                                  Instrumental part audio URL (separate_vocal
                                  type only)
                              vocalUrl:
                                type: string
                                description: Vocal part audio URL
                              backingVocalsUrl:
                                type: string
                                description: >-
                                  Backing vocals audio URL (split_stem type
                                  only)
                              drumsUrl:
                                type: string
                                description: Drums part audio URL (split_stem type only)
                              bassUrl:
                                type: string
                                description: Bass part audio URL (split_stem type only)
                              guitarUrl:
                                type: string
                                description: Guitar part audio URL (split_stem type only)
                              pianoUrl:
                                type: string
                                description: Piano part audio URL (split_stem type only)
                              keyboardUrl:
                                type: string
                                description: Keyboard part audio URL (split_stem type only)
                              percussionUrl:
                                type: string
                                description: >-
                                  Percussion part audio URL (split_stem type
                                  only)
                              stringsUrl:
                                type: string
                                description: Strings part audio URL (split_stem type only)
                              synthUrl:
                                type: string
                                description: >-
                                  Synthesizer part audio URL (split_stem type
                                  only)
                              fxUrl:
                                type: string
                                description: Effects part audio URL (split_stem type only)
                              brassUrl:
                                type: string
                                description: Brass part audio URL (split_stem type only)
                              woodwindsUrl:
                                type: string
                                description: >-
                                  Woodwinds part audio URL (split_stem type
                                  only)
                            x-apidog-orders:
                              - id
                              - originUrl
                              - originData
                              - instrumentalUrl
                              - vocalUrl
                              - backingVocalsUrl
                              - drumsUrl
                              - bassUrl
                              - guitarUrl
                              - pianoUrl
                              - keyboardUrl
                              - percussionUrl
                              - stringsUrl
                              - synthUrl
                              - fxUrl
                              - brassUrl
                              - woodwindsUrl
                            x-apidog-ignore-properties: []
                          successFlag:
                            type: string
                            description: Task status
                            enum:
                              - PENDING
                              - SUCCESS
                              - CREATE_TASK_FAILED
                              - GENERATE_AUDIO_FAILED
                              - CALLBACK_EXCEPTION
                          createTime:
                            type: string
                            description: Creation time
                            format: date-time
                          errorCode:
                            type: number
                            description: >-
                              Error code, valid when task fails


                              - **200**: Success - Request has been processed
                              successfully

                              - **500**: Internal Error - Please try again
                              later.
                            enum:
                              - 200
                              - 500
                          errorMessage:
                            type: string
                            description: Error message, valid when task fails
                        x-apidog-orders:
                          - taskId
                          - musicId
                          - callbackUrl
                          - musicIndex
                          - completeTime
                          - response
                          - successFlag
                          - createTime
                          - errorCode
                          - errorMessage
                        x-apidog-ignore-properties: []
                    x-apidog-orders:
                      - data
                    x-apidog-ignore-properties: []
              examples:
                separate_vocal:
                  summary: separate_vocal Type Query Result
                  value:
                    code: 200
                    msg: success
                    data:
                      taskId: 3e63b4cc88d52611159371f6af5571e7
                      musicId: 376c687e-d439-42c1-b1e4-bcb43b095ec2
                      callbackUrl: >-
                        https://57312fc2e366.ngrok-free.app/api/v1/vocal-removal/test
                      musicIndex: 0
                      completeTime: 1753782937000
                      response:
                        id: null
                        originUrl: null
                        originData:
                          - duration: 245.6
                            audio_url: https://example001.mp3
                            stem_type_group_name: Vocals
                            id: 3d7021c9-fa8b-4eda-91d1-3b9297ddb172
                          - duration: 245.6
                            audio_url: https://example002.mp3
                            stem_type_group_name: Instrumental
                            id: d92a13bf-c6f4-4ade-bb47-f69738435528
                        instrumentalUrl: >-
                          https://file.aiquickdraw.com/s/d92a13bf-c6f4-4ade-bb47-f69738435528_Instrumental.mp3
                        vocalUrl: >-
                          https://file.aiquickdraw.com/s/3d7021c9-fa8b-4eda-91d1-3b9297ddb172_Vocals.mp3
                        backingVocalsUrl: null
                        drumsUrl: null
                        bassUrl: null
                        guitarUrl: null
                        pianoUrl: null
                        keyboardUrl: null
                        percussionUrl: null
                        stringsUrl: null
                        synthUrl: null
                        fxUrl: null
                        brassUrl: null
                        woodwindsUrl: null
                      successFlag: SUCCESS
                      createTime: 1753782854000
                      errorCode: null
                      errorMessage: null
                split_stem:
                  summary: split_stem Type Query Result
                  value:
                    code: 200
                    msg: success
                    data:
                      taskId: e649edb7abfd759285bd41a47a634b10
                      musicId: 376c687e-d439-42c1-b1e4-bcb43b095ec2
                      callbackUrl: >-
                        https://57312fc2e366.ngrok-free.app/api/v1/vocal-removal/test
                      musicIndex: 0
                      completeTime: 1753782459000
                      response:
                        id: null
                        originUrl: null
                        originData:
                          - duration: 312.4
                            audio_url: https://example001.mp3
                            stem_type_group_name: Keyboard
                            id: adc934e0-fa7d-45da-da20-1dba160d74e0
                          - duration: 312.4
                            audio_url: https://example002.mp3
                            stem_type_group_name: Percussion
                            id: 0f70884d-047c-41f1-a6d0-7023js8b7dc6
                          - duration: 312.4
                            audio_url: https://example003.mp3
                            stem_type_group_name: Strings
                            id: 49829425-a5b0-424e-857a-75d4233a426b
                          - duration: 312.4
                            audio_url: https://example004.mp3
                            stem_type_group_name: Synth
                            id: 56b2d94a-eb92-4d21-bc43-346024we8348
                        instrumentalUrl: null
                        vocalUrl: >-
                          https://file.aiquickdraw.com/s/07420749-29a2-4054-9b62-e6a6f8b90ccb_Vocals.mp3
                        backingVocalsUrl: >-
                          https://file.aiquickdraw.com/s/aadc51a3-4c88-4c8e-a4c8-e867c539673d_Backing_Vocals.mp3
                        drumsUrl: >-
                          https://file.aiquickdraw.com/s/ac75c5ea-ac77-4ad2-b7d9-66e140b78e44_Drums.mp3
                        bassUrl: >-
                          https://file.aiquickdraw.com/s/a3c2da5a-b364-4422-adb5-2692b9c26d33_Bass.mp3
                        guitarUrl: >-
                          https://file.aiquickdraw.com/s/064dd08e-d5d2-4201-9058-c5c40fb695b4_Guitar.mp3
                        pianoUrl: null
                        keyboardUrl: >-
                          https://file.aiquickdraw.com/s/adc934e0-df7d-45da-8220-1dba160d74e0_Keyboard.mp3
                        percussionUrl: >-
                          https://file.aiquickdraw.com/s/0f70884d-047c-41f1-a6d0-7044618b7dc6_Percussion.mp3
                        stringsUrl: >-
                          https://file.aiquickdraw.com/s/49829425-a5b0-424e-857a-75d4c63a426b_Strings.mp3
                        synthUrl: >-
                          https://file.aiquickdraw.com/s/56b2d94a-eb92-4d21-bc43-3460de0c8348_Synth.mp3
                        fxUrl: >-
                          https://file.aiquickdraw.com/s/a8822c73-6629-4089-8f2a-d19f41f0007d_FX.mp3
                        brassUrl: >-
                          https://file.aiquickdraw.com/s/334b2d23-0c65-4a04-92c7-22f828afdd44_Brass.mp3
                        woodwindsUrl: >-
                          https://file.aiquickdraw.com/s/d81545b1-6f94-4388-9785-1aaa6ecabb02_Woodwinds.mp3
                      successFlag: SUCCESS
                      createTime: 1753782327000
                      errorCode: null
                      errorMessage: null
          headers: {}
          x-apidog-name: ''
        '500':
          description: request failed
          content:
            application/json:
              schema:
                type: object
                properties:
                  code:
                    type: integer
                    description: >-
                      Response status code


                      - **200**: Success - Request has been processed
                      successfully

                      - **401**: Unauthorized - Authentication credentials are
                      missing or invalid

                      - **402**: Insufficient Credits - Account does not have
                      enough credits to perform the operation

                      - **404**: Not Found - The requested resource or endpoint
                      does not exist

                      - **422**: Validation Error - The request parameters
                      failed validation checks

                      - **429**: Rate Limited - Request limit has been exceeded
                      for this resource

                      - **455**: Service Unavailable - System is currently
                      undergoing maintenance

                      - **500**: Server Error - An unexpected error occurred
                      while processing the request

                      - **501**: Generation Failed - Content generation task
                      failed

                      - **505**: Feature Disabled - The requested feature is
                      currently disabled
                  msg:
                    type: string
                    description: Response message, error description when failed
                  data:
                    type: object
                    properties: {}
                    x-apidog-orders: []
                    x-apidog-ignore-properties: []
                x-apidog-orders:
                  - code
                  - msg
                  - data
                required:
                  - code
                  - msg
                  - data
                x-apidog-ignore-properties: []
              example:
                code: 500
                msg: >-
                  Server Error - An unexpected error occurred while processing
                  the request
                data: null
          headers: {}
          x-apidog-name: 'Error '
      security:
        - BearerAuth: []
          x-apidog:
            schemeGroups:
              - id: kn8M4YUlc5i0A0179ezwx
                schemeIds:
                  - BearerAuth
            required: true
            use:
              id: kn8M4YUlc5i0A0179ezwx
            scopes:
              kn8M4YUlc5i0A0179ezwx:
                BearerAuth: []
      x-apidog-folder: docs/en/Market/Suno API/Vocal Removal
      x-apidog-status: released
      x-run-in-apidog: https://app.apidog.com/web/project/1184766/apis/api-28506301-run
components:
  schemas: {}
  securitySchemes:
    BearerAuth:
      type: bearer
      scheme: bearer
      bearerFormat: API Key
      description: |-
        所有 API 均需要通过 Bearer Token 进行身份验证。

        获取 API Key：
        1. 访问 [API Key 管理页面](https://kie.ai/api-key) 获取您的 API Key

        使用方法：
        在请求头中添加：
        Authorization: Bearer YOUR_API_KEY

        注意：
        - 请妥善保管您的 API Key，不要与他人分享
        - 如果您怀疑 API Key 已泄露，请立即在管理页面重置
servers:
  - url: https://api.kie.ai
    description: 正式环境
security:
  - BearerAuth: []
    x-apidog:
      schemeGroups:
        - id: kn8M4YUlc5i0A0179ezwx
          schemeIds:
            - BearerAuth
      required: true
      use:
        id: kn8M4YUlc5i0A0179ezwx
      scopes:
        kn8M4YUlc5i0A0179ezwx:
          BearerAuth: []

```


# ========== generate-midi ==========

# Generate MIDI from Audio

## OpenAPI Specification

```yaml
openapi: 3.0.1
info:
  title: ''
  description: ''
  version: 1.0.0
paths:
  /api/v1/midi/generate:
    post:
      summary: Generate MIDI from Audio
      deprecated: false
      description: >-
        > Convert separated audio tracks into MIDI format with detailed note
        information for each instrument.


        ## Usage Guide


        * Convert separated audio tracks into structured MIDI data containing
        pitch, timing, and velocity information

        * Requires a completed vocal separation task ID (from the Vocal Removal
        API)

        * Generates MIDI note data for multiple detected instruments including
        drums, bass, guitar, keyboards, and more

        * Ideal for music transcription, notation, remixing, or educational
        analysis

        * Best results on clean, well-separated audio tracks with clear
        instrument parts


        ## Prerequisites


        :::warning Required

        You must first use the [Vocal & Instrument Stem
        Separation](/suno-api/separate-vocals) API to separate your audio before
        generating MIDI.

        :::


        ## Parameter Reference


        | Name | Type | Description |

        | :--- | :--- | :--- |

        | **`taskId`** | string | **Required.** Task ID from a completed vocal
        separation. |

        | **`callBackUrl`** | string | **Required.** URL to receive MIDI
        generation completion notifications. |

        | **`audioId`** | string | **Optional.** Specifies which separated audio
        track to generate MIDI from. This `audioId` can be obtained from the
        `originData` array in the [Get Vocal Separation
        Details](/suno-api/get-vocal-separation-details) endpoint response. Each
        item in `originData` contains an `id` field that can be used here. If
        not provided, MIDI will be generated from all separated tracks. |


        ## Developer Notes


        * The callback will contain detailed note data for each detected
        instrument.

        * Each note includes: `pitch` (MIDI note number), `start` (seconds),
        `end` (seconds), `velocity` (0-1).

        * Not all instruments may be detected — depends on audio content.

        * **Pricing:** Check current per-call credit costs at
        [**https://kie.ai/pricing**](https://kie.ai/pricing).
      operationId: generate-midi
      tags:
        - docs/en/Market/Suno API/Vocal Removal
      parameters: []
      requestBody:
        content:
          application/json:
            schema:
              type: object
              required:
                - taskId
                - callBackUrl
              properties:
                taskId:
                  type: string
                  description: >-
                    Task ID from a completed vocal separation. This should be
                    the taskId returned from the Vocal & Instrument Stem
                    Separation endpoint.
                  examples:
                    - 5c79****be8e
                callBackUrl:
                  type: string
                  format: uri
                  description: >-
                    The URL to receive MIDI generation task completion updates.
                    Required for all MIDI generation requests.


                    - System will POST task status and MIDI note data to this
                    URL when generation completes

                    - Callback includes detailed note information for each
                    detected instrument with pitch, timing, and velocity

                    - Your callback endpoint should accept POST requests with
                    JSON payload containing MIDI data

                    - For detailed callback format and implementation guide, see
                    [MIDI Generation
                    Callbacks](https://docs.kie.ai/suno-api/generate-midi-callbacks)

                    - Alternatively, use the Get MIDI Generation Details
                    endpoint to poll task status

                    - To ensure callback security, see [Webhook Verification
                    Guide](/common-api/webhook-verification) for signature
                    verification implementation
                  examples:
                    - https://example.callback
                audioId:
                  type: string
                  description: >-
                    Optional. Specifies which separated audio track to generate
                    MIDI from. This audioId can be obtained from the
                    `originData` array in the Get Vocal Separation Details
                    endpoint response. Each item in `originData` contains an
                    `id` field that can be used here. If not provided, MIDI will
                    be generated from all separated tracks.
                  examples:
                    - 8ca376e7-******-08aaf2c6dd27
              x-apidog-orders:
                - taskId
                - callBackUrl
                - audioId
              x-apidog-ignore-properties: []
            example:
              taskId: 5c79****be8e
              callBackUrl: https://example.callback
              audioId: 8ca376e7-******-08aaf2c6dd27
      responses:
        '200':
          description: MIDI generation task created successfully
          content:
            application/json:
              schema:
                type: object
                properties:
                  code:
                    type: integer
                    description: Response status code
                    examples:
                      - 200
                  msg:
                    type: string
                    description: Response message
                    examples:
                      - success
                  data:
                    type: object
                    description: Response data containing task information
                    properties:
                      taskId:
                        type: string
                        description: >-
                          Unique identifier for the MIDI generation task. Use
                          this to query task status or receive callback results.
                        examples:
                          - 5c79****be8e
                    x-apidog-orders:
                      - taskId
                    x-apidog-ignore-properties: []
                x-apidog-orders:
                  - code
                  - msg
                  - data
                x-apidog-ignore-properties: []
              example:
                code: 200
                msg: success
                data:
                  taskId: 5c79****be8e
          headers: {}
          x-apidog-name: ''
        '500':
          description: request failed
          content:
            application/json:
              schema:
                type: object
                properties:
                  code:
                    type: integer
                    description: >-
                      Response status code


                      - **200**: Success - Request has been processed
                      successfully

                      - **401**: Unauthorized - Authentication credentials are
                      missing or invalid

                      - **402**: Insufficient Credits - Account does not have
                      enough credits to perform the operation

                      - **404**: Not Found - The requested resource or endpoint
                      does not exist

                      - **422**: Validation Error - The request parameters
                      failed validation checks

                      - **429**: Rate Limited - Request limit has been exceeded
                      for this resource

                      - **455**: Service Unavailable - System is currently
                      undergoing maintenance

                      - **500**: Server Error - An unexpected error occurred
                      while processing the request

                      - **501**: Generation Failed - Content generation task
                      failed

                      - **505**: Feature Disabled - The requested feature is
                      currently disabled
                  msg:
                    type: string
                    description: Response message, error description when failed
                  data:
                    type: object
                    properties: {}
                    x-apidog-orders: []
                    x-apidog-ignore-properties: []
                x-apidog-orders:
                  - code
                  - msg
                  - data
                required:
                  - code
                  - msg
                  - data
                x-apidog-ignore-properties: []
              example:
                code: 500
                msg: >-
                  Server Error - An unexpected error occurred while processing
                  the request
                data: null
          headers: {}
          x-apidog-name: 'Error '
      security:
        - BearerAuth: []
          x-apidog:
            schemeGroups:
              - id: kn8M4YUlc5i0A0179ezwx
                schemeIds:
                  - BearerAuth
            required: true
            use:
              id: kn8M4YUlc5i0A0179ezwx
            scopes:
              kn8M4YUlc5i0A0179ezwx:
                BearerAuth: []
      x-apidog-folder: docs/en/Market/Suno API/Vocal Removal
      x-apidog-status: released
      x-run-in-apidog: https://app.apidog.com/web/project/1184766/apis/api-28506302-run
components:
  schemas: {}
  securitySchemes:
    BearerAuth:
      type: bearer
      scheme: bearer
      bearerFormat: API Key
      description: |-
        所有 API 均需要通过 Bearer Token 进行身份验证。

        获取 API Key：
        1. 访问 [API Key 管理页面](https://kie.ai/api-key) 获取您的 API Key

        使用方法：
        在请求头中添加：
        Authorization: Bearer YOUR_API_KEY

        注意：
        - 请妥善保管您的 API Key，不要与他人分享
        - 如果您怀疑 API Key 已泄露，请立即在管理页面重置
servers:
  - url: https://api.kie.ai
    description: 正式环境
security:
  - BearerAuth: []
    x-apidog:
      schemeGroups:
        - id: kn8M4YUlc5i0A0179ezwx
          schemeIds:
            - BearerAuth
      required: true
      use:
        id: kn8M4YUlc5i0A0179ezwx
      scopes:
        kn8M4YUlc5i0A0179ezwx:
          BearerAuth: []

```


# ========== get-midi-details ==========

# Get MIDI Generation Details

## OpenAPI Specification

```yaml
openapi: 3.0.1
info:
  title: ''
  description: ''
  version: 1.0.0
paths:
  /api/v1/midi/record-info:
    get:
      summary: Get MIDI Generation Details
      deprecated: false
      description: >-
        Retrieve detailed information about a MIDI generation task including
        complete note data for all detected instruments.


        ### Usage Guide

        - Use this endpoint to check the status of a MIDI generation task

        - Access complete MIDI note data once processing is complete

        - Retrieve detailed instrument and note information

        - Track processing progress and any errors that may have occurred


        ### Status Descriptions

        - `successFlag: 0`: Pending - Task is waiting to be executed

        - `successFlag: 1`: Success - MIDI generation completed successfully

        - `successFlag: 2`: Failed - Failed to create task

        - `successFlag: 3`: Failed - MIDI generation failed

        - Check errorCode and errorMessage fields for failure details


        ### Developer Notes

        - The midiData field contains the complete MIDI data as a structured
        object with instruments and notes

        - MIDI data includes all detected instruments with pitch, timing, and
        velocity for each note

        - MIDI generation records are retained for 14 days

        - **Important**: When using vocal separation with `type: split_stem`,
        the midiData may be empty
      operationId: get-midi-details
      tags:
        - docs/en/Market/Suno API/Vocal Removal
      parameters:
        - name: taskId
          in: query
          description: The task ID returned from the MIDI generation request
          required: true
          example: 5c79****be8e
          schema:
            type: string
      responses:
        '200':
          description: MIDI generation task details retrieved successfully
          content:
            application/json:
              schema:
                type: object
                properties:
                  code:
                    type: integer
                    description: Response status code
                    examples:
                      - 200
                  msg:
                    type: string
                    description: Response message
                    examples:
                      - success
                  data:
                    type: object
                    description: MIDI generation task details
                    properties:
                      taskId:
                        type: string
                        description: MIDI generation task ID
                      recordTaskId:
                        type: integer
                        description: Internal record task ID
                      audioId:
                        type: string
                        description: Audio ID from the vocal separation task
                      callbackUrl:
                        type: string
                        description: Callback URL provided when creating the task
                      completeTime:
                        type: integer
                        description: Task completion timestamp (milliseconds)
                      midiData:
                        type: object
                        description: >-
                          Complete MIDI data containing detected instruments and
                          notes
                        properties:
                          state:
                            type: string
                            description: Processing state
                            examples:
                              - complete
                          instruments:
                            type: array
                            description: >-
                              Array of detected instruments with their MIDI
                              notes
                            items:
                              type: object
                              properties:
                                name:
                                  type: string
                                  description: Instrument name
                                notes:
                                  type: array
                                  description: Array of MIDI notes for this instrument
                                  items:
                                    type: object
                                    properties:
                                      pitch:
                                        type: integer
                                        description: MIDI note number (0-127)
                                      start:
                                        type: number
                                        description: Note start time in seconds
                                      end:
                                        type: number
                                        description: Note end time in seconds
                                      velocity:
                                        type: number
                                        description: Note velocity/intensity (0-1)
                                    x-apidog-orders:
                                      - pitch
                                      - start
                                      - end
                                      - velocity
                                    x-apidog-ignore-properties: []
                              x-apidog-orders:
                                - name
                                - notes
                              x-apidog-ignore-properties: []
                        x-apidog-orders:
                          - state
                          - instruments
                        x-apidog-ignore-properties: []
                      successFlag:
                        type: integer
                        description: >-
                          Task status flag: 0 = Pending, 1 = Success, 2 = Failed
                          to create task, 3 = MIDI generation failed
                      createTime:
                        type: integer
                        description: Task creation timestamp (milliseconds)
                      errorCode:
                        type: string
                        description: Error code if task failed
                        nullable: true
                      errorMessage:
                        type: string
                        description: Error message if task failed
                        nullable: true
                    x-apidog-orders:
                      - taskId
                      - recordTaskId
                      - audioId
                      - callbackUrl
                      - completeTime
                      - midiData
                      - successFlag
                      - createTime
                      - errorCode
                      - errorMessage
                    x-apidog-ignore-properties: []
                x-apidog-orders:
                  - code
                  - msg
                  - data
                x-apidog-ignore-properties: []
              example:
                code: 200
                msg: success
                data:
                  taskId: 5c79****be8e
                  recordTaskId: -1
                  audioId: e231****-****-****-****-****8cadc7dc
                  callbackUrl: https://example.callback
                  completeTime: 1760335255000
                  midiData:
                    state: complete
                    instruments:
                      - name: Drums
                        notes:
                          - pitch: 73
                            start: 0.036458333333333336
                            end: 0.18229166666666666
                            velocity: 1
                          - pitch: 61
                            start: 0.046875
                            end: 0.19270833333333334
                            velocity: 1
                      - name: Electric Bass (finger)
                        notes:
                          - pitch: 44
                            start: 7.6875
                            end: 7.911458333333333
                            velocity: 1
                  successFlag: 1
                  createTime: 1760335251000
                  errorCode: null
                  errorMessage: null
          headers: {}
          x-apidog-name: ''
        '500':
          description: request failed
          content:
            application/json:
              schema:
                type: object
                properties:
                  code:
                    type: integer
                    description: >-
                      Response status code


                      - **200**: Success - Request has been processed
                      successfully

                      - **401**: Unauthorized - Authentication credentials are
                      missing or invalid

                      - **402**: Insufficient Credits - Account does not have
                      enough credits to perform the operation

                      - **404**: Not Found - The requested resource or endpoint
                      does not exist

                      - **422**: Validation Error - The request parameters
                      failed validation checks

                      - **429**: Rate Limited - Request limit has been exceeded
                      for this resource

                      - **455**: Service Unavailable - System is currently
                      undergoing maintenance

                      - **500**: Server Error - An unexpected error occurred
                      while processing the request

                      - **501**: Generation Failed - Content generation task
                      failed

                      - **505**: Feature Disabled - The requested feature is
                      currently disabled
                  msg:
                    type: string
                    description: Response message, error description when failed
                  data:
                    type: object
                    properties: {}
                    x-apidog-orders: []
                    x-apidog-ignore-properties: []
                x-apidog-orders:
                  - code
                  - msg
                  - data
                required:
                  - code
                  - msg
                  - data
                x-apidog-ignore-properties: []
              example:
                code: 500
                msg: >-
                  Server Error - An unexpected error occurred while processing
                  the request
                data: null
          headers: {}
          x-apidog-name: 'Error '
      security:
        - BearerAuth: []
          x-apidog:
            schemeGroups:
              - id: kn8M4YUlc5i0A0179ezwx
                schemeIds:
                  - BearerAuth
            required: true
            use:
              id: kn8M4YUlc5i0A0179ezwx
            scopes:
              kn8M4YUlc5i0A0179ezwx:
                BearerAuth: []
      x-apidog-folder: docs/en/Market/Suno API/Vocal Removal
      x-apidog-status: released
      x-run-in-apidog: https://app.apidog.com/web/project/1184766/apis/api-28506303-run
components:
  schemas: {}
  securitySchemes:
    BearerAuth:
      type: bearer
      scheme: bearer
      bearerFormat: API Key
      description: |-
        所有 API 均需要通过 Bearer Token 进行身份验证。

        获取 API Key：
        1. 访问 [API Key 管理页面](https://kie.ai/api-key) 获取您的 API Key

        使用方法：
        在请求头中添加：
        Authorization: Bearer YOUR_API_KEY

        注意：
        - 请妥善保管您的 API Key，不要与他人分享
        - 如果您怀疑 API Key 已泄露，请立即在管理页面重置
servers:
  - url: https://api.kie.ai
    description: 正式环境
security:
  - BearerAuth: []
    x-apidog:
      schemeGroups:
        - id: kn8M4YUlc5i0A0179ezwx
          schemeIds:
            - BearerAuth
      required: true
      use:
        id: kn8M4YUlc5i0A0179ezwx
      scopes:
        kn8M4YUlc5i0A0179ezwx:
          BearerAuth: []

```


# ========== create-music-video ==========

# Create Music Video

## OpenAPI Specification

```yaml
openapi: 3.0.1
info:
  title: ''
  description: ''
  version: 1.0.0
paths:
  /api/v1/mp4/generate:
    post:
      summary: Create Music Video
      deprecated: false
      description: >-
        Create a video with visualizations based on your generated music track.


        ### Usage Guide

        - Use this endpoint to turn your audio tracks into visually appealing
        videos

        - Add artist attribution and branding to your music videos

        - Videos can be shared on social media or embedded in websites


        ### Parameter Details

        - `taskId` identifies the original music generation task

        - `audioId` specifies which audio track to visualize when multiple
        variations exist

        - Optional `author` and `domainName` add customized branding to the
        video


        ### Developer Notes

        - Generated video files are retained for 14 days

        - Videos are optimized for social media sharing

        - Processing time varies based on audio length and server load
      operationId: create-music-video
      tags:
        - docs/en/Market/Suno API/Music Video Generation
      parameters: []
      requestBody:
        content:
          application/json:
            schema:
              type: object
              required:
                - taskId
                - audioId
                - callBackUrl
              properties:
                taskId:
                  type: string
                  description: >-
                    Unique identifier of the music generation task. This should
                    be a taskId returned from either the "Generate Music" or
                    "Extend Music" endpoints.
                  examples:
                    - taskId_774b9aa0422f
                audioId:
                  type: string
                  description: >-
                    Unique identifier of the specific audio track to visualize.
                    This ID is returned in the callback data after music
                    generation completes.
                  examples:
                    - e231****-****-****-****-****8cadc7dc
                callBackUrl:
                  type: string
                  format: uri
                  description: >-
                    The URL to receive music video generation task completion
                    updates. Required for all music video generation requests.


                    - System will POST task status and results to this URL when
                    video generation completes

                    - Callback includes the generated music video file URL with
                    visual effects and branding

                    - Your callback endpoint should accept POST requests with
                    JSON payload containing the video file location

                    - For detailed callback format and implementation guide, see
                    [Music Video
                    Callbacks](https://docs.kie.ai/suno-api/create-music-video-callbacks)

                    - Alternatively, use the Get Music Video Details endpoint to
                    poll task status

                    - To ensure callback security, see [Webhook Verification
                    Guide](/common-api/webhook-verification) for signature
                    verification implementation
                  examples:
                    - https://api.example.com/callback
                author:
                  type: string
                  maxLength: 50
                  description: >-
                    Artist or creator name to display as a signature on the
                    video cover. Maximum 50 characters. This creates attribution
                    for the music creator.
                  examples:
                    - DJ Electronic
                domainName:
                  type: string
                  maxLength: 50
                  description: >-
                    Website or brand to display as a watermark at the bottom of
                    the video. Maximum 50 characters. Useful for promotional
                    branding or attribution.
                  examples:
                    - music.example.com
              x-apidog-orders:
                - taskId
                - audioId
                - callBackUrl
                - author
                - domainName
              x-apidog-ignore-properties: []
            example:
              uploadUrlList:
                - https://example.com/audio1.mp3
                - https://example.com/audio2.mp3
              customMode: true
              model: V4
              callBackUrl: https://example.com/callback
              prompt: A calm and relaxing piano track with soft melodies
              style: Jazz
              title: Relaxing Piano
              instrumental: true
              vocalGender: m
              styleWeight: 0.61
              weirdnessConstraint: 0.72
              audioWeight: 0.65
      responses:
        '200':
          description: Success
          content:
            application/json:
              schema:
                allOf:
                  - type: object
                    properties:
                      code:
                        type: integer
                        enum:
                          - 200
                          - 400
                          - 401
                          - 402
                          - 404
                          - 409
                          - 422
                          - 429
                          - 455
                          - 500
                        description: >-
                          Response status code


                          - **200**: Success - Request has been processed
                          successfully

                          - **400**: Format Error - The parameter is not in a
                          valid JSON format

                          - **401**: Unauthorized - Authentication credentials
                          are missing or invalid

                          - **402**: Insufficient Credits - Account does not
                          have enough credits to perform the operation

                          - **404**: Not Found - The requested resource or
                          endpoint does not exist

                          - **409**: Conflict - WAV record already exists

                          - **422**: Validation Error - The request parameters
                          failed validation checks

                          - **429**: Rate Limited - Your call frequency is too
                          high. Please try again later.

                          - **455**: Service Unavailable - System is currently
                          undergoing maintenance

                          - **500**: Server Error - An unexpected error occurred
                          while processing the request

                          Build Failed - Audio mp4 generation failed
                      msg:
                        type: string
                        description: Error message when code != 200
                        examples:
                          - success
                    x-apidog-orders:
                      - code
                      - msg
                    x-apidog-ignore-properties: []
                type: object
                properties:
                  code:
                    type: integer
                    format: int32
                    description: Status code
                    examples:
                      - 0
                  msg:
                    type: string
                    description: Status message
                    examples:
                      - ''
                  data:
                    type: object
                    properties:
                      taskId:
                        type: string
                        description: Task ID
                        examples:
                          - ''
                    x-apidog-orders:
                      - taskId
                    x-apidog-ignore-properties: []
                x-apidog-orders:
                  - code
                  - msg
                  - data
                x-apidog-ignore-properties: []
              example:
                code: 0
                msg: ''
                data:
                  taskId: ''
          headers: {}
          x-apidog-name: ''
        '500':
          description: request failed
          content:
            application/json:
              schema:
                type: object
                properties:
                  code:
                    type: integer
                    description: >-
                      Response status code


                      - **200**: Success - Request has been processed
                      successfully

                      - **401**: Unauthorized - Authentication credentials are
                      missing or invalid

                      - **402**: Insufficient Credits - Account does not have
                      enough credits to perform the operation

                      - **404**: Not Found - The requested resource or endpoint
                      does not exist

                      - **422**: Validation Error - The request parameters
                      failed validation checks

                      - **429**: Rate Limited - Request limit has been exceeded
                      for this resource

                      - **455**: Service Unavailable - System is currently
                      undergoing maintenance

                      - **500**: Server Error - An unexpected error occurred
                      while processing the request

                      - **501**: Generation Failed - Content generation task
                      failed

                      - **505**: Feature Disabled - The requested feature is
                      currently disabled
                  msg:
                    type: string
                    description: Response message, error description when failed
                  data:
                    type: object
                    properties: {}
                    x-apidog-orders: []
                    x-apidog-ignore-properties: []
                x-apidog-orders:
                  - code
                  - msg
                  - data
                required:
                  - code
                  - msg
                  - data
                x-apidog-ignore-properties: []
              example:
                code: 500
                msg: >-
                  Server Error - An unexpected error occurred while processing
                  the request
                data: null
          headers: {}
          x-apidog-name: 'Error '
      security:
        - BearerAuth: []
          x-apidog:
            schemeGroups:
              - id: kn8M4YUlc5i0A0179ezwx
                schemeIds:
                  - BearerAuth
            required: true
            use:
              id: kn8M4YUlc5i0A0179ezwx
            scopes:
              kn8M4YUlc5i0A0179ezwx:
                BearerAuth: []
      callbacks:
        onMp4Generated:
          '{$request.body#/callBackUrl}':
            post:
              summary: MP4 Generation Completion Callback
              description: >-
                When MP4 generation is complete, the system will send a POST
                request to the provided callback URL to notify the result
              requestBody:
                required: true
                content:
                  application/json:
                    schema:
                      allOf:
                        - type: object
                          properties:
                            code:
                              type: integer
                              enum:
                                - 200
                                - 500
                              description: >-
                                Response status code


                                - **200**: Success - Request has been processed
                                successfully

                                - **500**: Internal Error - Please try again
                                later.
                            msg:
                              type: string
                              description: Error message when code != 200
                              example: success
                      type: object
                      required:
                        - code
                        - msg
                        - data
                      properties:
                        code:
                          type: integer
                          description: Status code, 0 indicates success
                          example: 0
                        msg:
                          type: string
                          description: Status message
                          example: msg_9a23a47664f7
                        data:
                          type: object
                          required:
                            - task_id
                            - video_url
                          properties:
                            task_id:
                              type: string
                              description: Unique identifier of the generation task
                              example: task_id_5bbe7721119d
                            video_url:
                              type: string
                              description: Accessible video URL, valid for 14 days
                              example: video_url_847715e66259
              responses:
                '200':
                  description: Callback received successfully
      x-apidog-folder: docs/en/Market/Suno API/Music Video Generation
      x-apidog-status: released
      x-run-in-apidog: https://app.apidog.com/web/project/1184766/apis/api-28506304-run
components:
  schemas: {}
  securitySchemes:
    BearerAuth:
      type: bearer
      scheme: bearer
      bearerFormat: API Key
      description: |-
        所有 API 均需要通过 Bearer Token 进行身份验证。

        获取 API Key：
        1. 访问 [API Key 管理页面](https://kie.ai/api-key) 获取您的 API Key

        使用方法：
        在请求头中添加：
        Authorization: Bearer YOUR_API_KEY

        注意：
        - 请妥善保管您的 API Key，不要与他人分享
        - 如果您怀疑 API Key 已泄露，请立即在管理页面重置
servers:
  - url: https://api.kie.ai
    description: 正式环境
security:
  - BearerAuth: []
    x-apidog:
      schemeGroups:
        - id: kn8M4YUlc5i0A0179ezwx
          schemeIds:
            - BearerAuth
      required: true
      use:
        id: kn8M4YUlc5i0A0179ezwx
      scopes:
        kn8M4YUlc5i0A0179ezwx:
          BearerAuth: []

```


# ========== get-music-video-details ==========

# Get Music Video Details

## OpenAPI Specification

```yaml
openapi: 3.0.1
info:
  title: ''
  description: ''
  version: 1.0.0
paths:
  /api/v1/mp4/record-info:
    get:
      summary: Get Music Video Details
      deprecated: false
      description: >-
        Retrieve detailed information about a music video generation task.


        ### Usage Guide

        - Use this endpoint to check the status of a video generation task

        - Access the video URL once generation is complete

        - Track processing progress and any errors that may have occurred


        ### Status Descriptions

        - `PENDING`: Task is waiting to be processed

        - `SUCCESS`: Video generation completed successfully

        - `CREATE_TASK_FAILED`: Failed to create the video generation task

        - `GENERATE_MP4_FAILED`: Failed during video file creation


        ### Developer Notes

        - The video URL is only available in the response when status is
        `SUCCESS`

        - Error codes and messages are provided for failed tasks

        - Videos are retained for 14 days after successful generation
      operationId: get-music-video-details
      tags:
        - docs/en/Market/Suno API/Music Video Generation
      parameters:
        - name: taskId
          in: query
          description: >-
            Unique identifier of the music video generation task to retrieve.
            This is the taskId returned when creating the music video generation
            task.
          required: true
          example: taskId_774b9aa0422f
          schema:
            type: string
      responses:
        '200':
          description: Success
          content:
            application/json:
              schema:
                allOf:
                  - type: object
                    properties:
                      code:
                        type: integer
                        enum:
                          - 200
                          - 400
                          - 401
                          - 402
                          - 404
                          - 409
                          - 422
                          - 429
                          - 455
                          - 500
                        description: >-
                          Response status code


                          - **200**: Success - Request has been processed
                          successfully

                          - **400**: Format Error - The parameter is not in a
                          valid JSON format

                          - **401**: Unauthorized - Authentication credentials
                          are missing or invalid

                          - **402**: Insufficient Credits - Account does not
                          have enough credits to perform the operation

                          - **404**: Not Found - The requested resource or
                          endpoint does not exist

                          - **409**: Conflict - WAV record already exists

                          - **422**: Validation Error - The request parameters
                          failed validation checks

                          - **429**: Rate Limited - Request limit has been
                          exceeded for this resource

                          - **455**: Service Unavailable - System is currently
                          undergoing maintenance

                          - **500**: Server Error - An unexpected error occurred
                          while processing the request
                      msg:
                        type: string
                        description: Error message when code != 200
                        examples:
                          - success
                    x-apidog-orders:
                      - code
                      - msg
                    x-apidog-ignore-properties: []
                type: object
                properties:
                  code:
                    type: integer
                    format: int32
                    description: Status code
                    examples:
                      - 0
                  msg:
                    type: string
                    description: Status message
                    examples:
                      - ''
                  data:
                    type: object
                    properties:
                      taskId:
                        type: string
                        description: Task ID
                        examples:
                          - ''
                      musicId:
                        type: string
                        description: Music ID
                        examples:
                          - ''
                      callbackUrl:
                        type: string
                        description: Callback URL
                        examples:
                          - ''
                      musicIndex:
                        type: integer
                        format: int32
                        description: Music index 0 or 1
                        examples:
                          - 0
                      completeTime:
                        type: string
                        format: date-time
                        description: Completion callback time
                        examples:
                          - ''
                      response:
                        type: object
                        description: Completion callback result
                        properties:
                          videoUrl:
                            type: string
                            description: Video URL
                            examples:
                              - ''
                        x-apidog-orders:
                          - videoUrl
                        x-apidog-ignore-properties: []
                      successFlag:
                        type: string
                        description: >-
                          PENDING-Waiting for execution SUCCESS-Success
                          CREATE_TASK_FAILED-Failed to create task
                          GENERATE_MP4_FAILED-Failed to generate MP4
                        examples:
                          - ''
                      createTime:
                        type: string
                        format: date-time
                        description: Creation time
                        examples:
                          - ''
                      errorCode:
                        type: integer
                        format: int32
                        description: >-
                          Error code


                          - **200**: Success - Request has been processed
                          successfully

                          - **500**: Internal Error - Please try again later.
                        enum:
                          - 200
                          - 500
                        examples:
                          - 0
                      errorMessage:
                        type: string
                        description: Error message
                        examples:
                          - ''
                    x-apidog-orders:
                      - taskId
                      - musicId
                      - callbackUrl
                      - musicIndex
                      - completeTime
                      - response
                      - successFlag
                      - createTime
                      - errorCode
                      - errorMessage
                    x-apidog-ignore-properties: []
                x-apidog-orders:
                  - code
                  - msg
                  - data
                x-apidog-ignore-properties: []
              example:
                code: 200
                msg: success
                data:
                  taskId: 988e****c8d3
                  musicId: e231****-****-****-****-****8cadc7dc
                  callbackUrl: https://api.example.com/callback
                  musicIndex: 0
                  completeTime: '2025-01-01 00:10:00'
                  response:
                    videoUrl: https://example.com/s/04e6****e727.mp4
                  successFlag: SUCCESS
                  createTime: '2025-01-01 00:00:00'
                  errorCode: null
                  errorMessage: null
          headers: {}
          x-apidog-name: ''
        '500':
          description: request failed
          content:
            application/json:
              schema:
                type: object
                properties:
                  code:
                    type: integer
                    description: >-
                      Response status code


                      - **200**: Success - Request has been processed
                      successfully

                      - **401**: Unauthorized - Authentication credentials are
                      missing or invalid

                      - **402**: Insufficient Credits - Account does not have
                      enough credits to perform the operation

                      - **404**: Not Found - The requested resource or endpoint
                      does not exist

                      - **422**: Validation Error - The request parameters
                      failed validation checks

                      - **429**: Rate Limited - Request limit has been exceeded
                      for this resource

                      - **455**: Service Unavailable - System is currently
                      undergoing maintenance

                      - **500**: Server Error - An unexpected error occurred
                      while processing the request

                      - **501**: Generation Failed - Content generation task
                      failed

                      - **505**: Feature Disabled - The requested feature is
                      currently disabled
                  msg:
                    type: string
                    description: Response message, error description when failed
                  data:
                    type: object
                    properties: {}
                    x-apidog-orders: []
                    x-apidog-ignore-properties: []
                x-apidog-orders:
                  - code
                  - msg
                  - data
                required:
                  - code
                  - msg
                  - data
                x-apidog-ignore-properties: []
              example:
                code: 500
                msg: >-
                  Server Error - An unexpected error occurred while processing
                  the request
                data: null
          headers: {}
          x-apidog-name: 'Error '
      security:
        - BearerAuth: []
          x-apidog:
            schemeGroups:
              - id: kn8M4YUlc5i0A0179ezwx
                schemeIds:
                  - BearerAuth
            required: true
            use:
              id: kn8M4YUlc5i0A0179ezwx
            scopes:
              kn8M4YUlc5i0A0179ezwx:
                BearerAuth: []
      x-apidog-folder: docs/en/Market/Suno API/Music Video Generation
      x-apidog-status: released
      x-run-in-apidog: https://app.apidog.com/web/project/1184766/apis/api-28506305-run
components:
  schemas: {}
  securitySchemes:
    BearerAuth:
      type: bearer
      scheme: bearer
      bearerFormat: API Key
      description: |-
        所有 API 均需要通过 Bearer Token 进行身份验证。

        获取 API Key：
        1. 访问 [API Key 管理页面](https://kie.ai/api-key) 获取您的 API Key

        使用方法：
        在请求头中添加：
        Authorization: Bearer YOUR_API_KEY

        注意：
        - 请妥善保管您的 API Key，不要与他人分享
        - 如果您怀疑 API Key 已泄露，请立即在管理页面重置
servers:
  - url: https://api.kie.ai
    description: 正式环境
security:
  - BearerAuth: []
    x-apidog:
      schemeGroups:
        - id: kn8M4YUlc5i0A0179ezwx
          schemeIds:
            - BearerAuth
      required: true
      use:
        id: kn8M4YUlc5i0A0179ezwx
      scopes:
        kn8M4YUlc5i0A0179ezwx:
          BearerAuth: []

```
