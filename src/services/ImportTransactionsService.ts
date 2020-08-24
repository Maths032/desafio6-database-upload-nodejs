import csvParse from 'csv-parse';
import fs from 'fs';
import { getCustomRepository, getRepository, In } from 'typeorm';
import Transaction from '../models/Transaction';
import TransactionsRepository from '../repositories/TransactionsRepository';
import Category from '../models/Category';

interface CSVtransactions {
  title: string;
  type: 'income' | 'outcome';
  value: number;
  category: string;
}

class ImportTransactionsService {
  async execute(filePath: string): Promise<Transaction[]> {
    const transactionsRepository = getCustomRepository(TransactionsRepository);
    const categoryRepository = getRepository(Category);

    const contactsReadStream = fs.createReadStream(filePath);

    const parsers = csvParse({
      from_line: 2,
    });

    const parseCSV = contactsReadStream.pipe(parsers);

    const transactions: CSVtransactions[] = [];
    const categories: string[] = [];

    // vai ler linha por linha do csv a partir da linha 2
    parseCSV.on('data', async line => {
      const [title, type, value, category] = line.map(
        (cell: string) => cell.trim(), // separa cada informação
      );

      if (!title || !type || !value) return; // verifica se existem todos os campos

      categories.push(category); // adiciona a categoria ao array correspondente
      transactions.push({ title, type, value, category }); // insere as informações da transaction no array para que posteriormente seja inserido de uma vez ao banco de dados
    });

    await new Promise(resolve => parseCSV.on('end', resolve)); // espera o parseCSV.on terminar de rodar

    const existentCategories = await categoryRepository.find({
      // faz um select no banco buscando todas as categorias informadas no csv
      where: {
        title: In(categories),
      },
    });

    const ExistentCategoiresTitles = existentCategories.map(
      // separa somente o title das categorias
      (category: Category) => category.title,
    );

    const addCategoryTitles = categories
      .filter(category => !ExistentCategoiresTitles.includes(category)) // verifica se nao exite a categoria
      .filter((value, index, self) => self.indexOf(value) === index); // remove resultados duplicados

    const newCategories = categoryRepository.create(
      addCategoryTitles.map(title => ({
        title,
      })),
    );

    await categoryRepository.save(newCategories);

    const finalCategories = [...newCategories, ...existentCategories];

    const createdTransactions = transactionsRepository.create(
      transactions.map(transaction => ({
        title: transaction.title,
        type: transaction.type,
        value: transaction.value,
        category: finalCategories.find(
          category => category.title === transaction.category,
        ),
      })),
    );

    await transactionsRepository.save(createdTransactions);

    await fs.promises.unlink(filePath);

    return createdTransactions;
  }
}

export default ImportTransactionsService;
