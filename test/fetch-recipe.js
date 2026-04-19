#!/usr/bin/env node
import dotenv from 'dotenv';
import { TandoorClient } from './build/client.js';

dotenv.config();

const tandoorClient = new TandoorClient({
  url: process.env.TANDOOR_URL,
  token: process.env.TANDOOR_TOKEN,
});

async function fetchRecipe(id) {
  try {
    console.log(`Fetching recipe ${id}...`);
    const recipe = await tandoorClient.getRecipe(id);
    
    console.log('\nRecipe Details:');
    console.log('='.repeat(60));
    console.log(`Name: ${recipe.name}`);
    console.log(`Description: ${recipe.description}`);
    console.log(`Servings: ${recipe.servings}`);
    console.log(`Working Time: ${recipe.working_time} minutes`);
    console.log(`Keywords: ${recipe.keywords?.map(k => k.name).join(', ')}`);
    console.log('\nSteps:');
    recipe.steps.forEach((step, i) => {
      console.log(`\n${i + 1}. ${step.instruction}`);
      if (step.ingredients && step.ingredients.length > 0) {
        console.log('   Ingredients:');
        step.ingredients.forEach(ing => {
          const unit = ing.unit?.name || '';
          console.log(`   - ${ing.amount} ${unit} ${ing.food?.name || 'unknown'}`);
        });
      }
    });
    console.log('='.repeat(60));
    
  } catch (error) {
    console.error('Error:', error.message);
  }
}

const recipeId = process.argv[2] || 9;
fetchRecipe(parseInt(recipeId));
