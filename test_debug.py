import asyncio
from modules.llm import LLMEngine

async def test():
    llm = LLMEngine()
    print('Testing Batch generation...')
    slides = await llm.generate_all_slides_batch(
        query='Deep Learning',
        context_text='Deep learning uses neural networks. (Page 98)',
        num_slides=1,
        language='English'
    )
    print(slides)

asyncio.run(test())
